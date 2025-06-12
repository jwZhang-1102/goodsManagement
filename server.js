//server.js
const Koa = require('koa');
const path = require('path');
const fs = require('fs');
const static = require('koa-static');
const bodyParser = require('koa-bodyparser');
const mysql = require('mysql2/promise');

const app = new Koa();

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'purchase_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const PORT = 3030;
const HOST = '127.0.0.1';

app.use(static(path.join(__dirname, '../')));
app.use(bodyParser());

// 获取库存数据
app.use(async (ctx, next) => {
    if (ctx.path === '/api/inventory' && ctx.method === 'GET') {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    i.*,
                    p.name AS product_name,
                    w.warehouse_name,
                    w.location
                FROM inventory i
                JOIN products p ON i.product_code = p.code
                JOIN warehouses w ON i.warehouse_code = w.warehouse_code
                ORDER BY p.name, w.warehouse_name
            `);
            ctx.body = rows;
        } catch (err) {
            console.error('获取库存列表出错:', err);
            ctx.status = 500;
            ctx.body = { error: '获取库存列表失败' };
        }
    } else {
        await next();
    }
});

// 库存调拨
app.use(async (ctx, next) => {
    if (ctx.path === '/api/inventory/transfer' && ctx.method === 'POST') {
        try {
            const { productCode, fromWarehouse, toWarehouse, quantity, transferredBy = '系统管理员' } = ctx.request.body;
            
            // 验证必填字段
            if (!productCode || !fromWarehouse || !toWarehouse || !quantity) {
                ctx.status = 400;
                ctx.body = { error: '商品编码、仓库和调拨数量是必填项' };
                return;
            }
            
            if (fromWarehouse === toWarehouse) {
                ctx.status = 400;
                ctx.body = { error: '来源仓库和目标仓库不能相同' };
                return;
            }
            
            if (quantity <= 0) {
                ctx.status = 400;
                ctx.body = { error: '调拨数量必须大于0' };
                return;
            }
            
            // 开始事务
            const conn = await pool.getConnection();
            await conn.beginTransaction();
            
            try {
                // 检查来源仓库是否有足够库存
                const [fromInventory] = await conn.query(
                    'SELECT current_stock FROM inventory WHERE product_code = ? AND warehouse_code = ? FOR UPDATE',
                    [productCode, fromWarehouse]
                );
                
                if (fromInventory.length === 0) {
                    ctx.status = 400;
                    ctx.body = { error: '来源仓库没有该商品的库存记录' };
                    await conn.rollback();
                    conn.release();
                    return;
                }
                
                if (fromInventory[0].current_stock < quantity) {
                    ctx.status = 400;
                    ctx.body = { error: '来源仓库库存不足' };
                    await conn.rollback();
                    conn.release();
                    return;
                }
                
                // 减少来源仓库库存
                await conn.query(
                    'UPDATE inventory SET current_stock = current_stock - ? WHERE product_code = ? AND warehouse_code = ?',
                    [quantity, productCode, fromWarehouse]
                );
                
                // 检查目标仓库是否有该商品库存记录
                const [toInventory] = await conn.query(
                    'SELECT * FROM inventory WHERE product_code = ? AND warehouse_code = ? FOR UPDATE',
                    [productCode, toWarehouse]
                );
                
                if (toInventory.length === 0) {
                    // 如果目标仓库没有该商品记录，创建新记录
                    const [product] = await conn.query(
                        'SELECT name FROM products WHERE code = ?',
                        [productCode]
                    );
                    
                    if (product.length === 0) {
                        ctx.status = 400;
                        ctx.body = { error: '商品不存在' };
                        await conn.rollback();
                        conn.release();
                        return;
                    }
                    
                    await conn.query(
                        'INSERT INTO inventory (warehouse_code, product_code, current_stock, safety_stock) VALUES (?, ?, ?, 0)',
                        [toWarehouse, productCode, quantity]
                    );
                } else {
                    // 增加目标仓库库存
                    await conn.query(
                        'UPDATE inventory SET current_stock = current_stock + ? WHERE product_code = ? AND warehouse_code = ?',
                        [quantity, productCode, toWarehouse]
                    );
                }
                
                // 获取仓库名称和商品名称
                const [warehouses] = await conn.query(
                    'SELECT warehouse_code, warehouse_name FROM warehouses WHERE warehouse_code IN (?, ?)',
                    [fromWarehouse, toWarehouse]
                );
                
                const [product] = await conn.query(
                    'SELECT name FROM products WHERE code = ?',
                    [productCode]
                );
                
                if (warehouses.length !== 2 || product.length === 0) {
                    ctx.status = 400;
                    ctx.body = { error: '无效的仓库或商品信息' };
                    await conn.rollback();
                    conn.release();
                    return;
                }
                
                const fromWarehouseName = warehouses.find(w => w.warehouse_code === fromWarehouse).warehouse_name;
                const toWarehouseName = warehouses.find(w => w.warehouse_code === toWarehouse).warehouse_name;
                const productName = product[0].name;
                
                // 记录调拨操作
                await conn.query(
                    `INSERT INTO inventory_transfers 
                    (product_code, product_name, from_warehouse_code, from_warehouse_name, 
                     to_warehouse_code, to_warehouse_name, quantity, transferred_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [productCode, productName, fromWarehouse, fromWarehouseName, 
                     toWarehouse, toWarehouseName, quantity, transferredBy]
                );
                
                // 提交事务
                await conn.commit();
                conn.release();
                
                ctx.body = { 
                    success: true,
                    message: '库存调拨成功'
                };
            } catch (err) {
                // 回滚事务
                await conn.rollback();
                conn.release();
                throw err;
            }
        } catch (err) {
            console.error('库存调拨出错:', err);
            ctx.status = 500;
            ctx.body = { error: '服务器内部错误', details: err.message };
        }
    } else {
        await next();
    }
});


// 获取调拨记录
app.use(async (ctx, next) => {
    if (ctx.path === '/api/inventory/transfers' && ctx.method === 'GET') {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    transfer_id,
                    product_code,
                    product_name,
                    from_warehouse_code,
                    from_warehouse_name,
                    to_warehouse_code,
                    to_warehouse_name,
                    quantity,
                    transferred_by,
                    transferred_at
                FROM inventory_transfers
                ORDER BY transferred_at DESC
                LIMIT 10
            `);
            ctx.body = rows;
        } catch (err) {
            console.error('获取调拨记录出错:', err);
            ctx.status = 500;
            ctx.body = { error: '获取调拨记录失败' };
        }
    } else {
        await next();
    }
});

// 创建新采购订单
app.use(async (ctx, next) => {
  if (ctx.path === '/api/purchase-orders' && ctx.method === 'POST') {
    try {
      const { order_code, supplier_id, total_amount, items ,created_by } = ctx.request.body;
      
      // 验证必填字段
      if (!order_code || !supplier_id || !items || items.length === 0 || !created_by) {
        ctx.status = 400;
        ctx.body = { error: '订单编号、供应商、创建人和商品清单是必填项' };
        return;
      }
      
      // 获取供应商名称
      const [supplierRows] = await pool.query('SELECT name FROM suppliers WHERE id = ?', [supplier_id]);
      if (supplierRows.length === 0) {
        ctx.status = 400;
        ctx.body = { error: '未找到指定供应商' };
        return;
      }
      const supplier_name = supplierRows[0].name;
      
      // 开始事务
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      
      try {
        // 插入订单主表
        const [orderResult] = await conn.execute(
          `INSERT INTO purchase_orders 
           (order_code, supplier_id, supplier_name, total_amount, status, created_by)
           VALUES (?, ?, ?, ?, '待审批', ?)`,
          [order_code, supplier_id, supplier_name, total_amount, created_by]
        );
        
        const orderId = orderResult.insertId;
        
        // 插入订单商品明细
        for (const item of items) {
          await conn.execute(
            `INSERT INTO purchase_order_items 
             (order_id, product_code, product_name, quantity, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, item.product_code, item.product_name, item.quantity, item.unit_price, item.total_price]
          );
        }
        
        // 提交事务
        await conn.commit();
        conn.release();
        
        ctx.status = 201;
        ctx.body = { 
          success: true,
          orderId: orderId,
          message: '订单创建成功'
        };
      } catch (err) {
        // 回滚事务
        await conn.rollback();
        conn.release();
        throw err;
      }
    } catch (err) {
      console.error('创建订单出错:', err);
      ctx.status = 500;
      ctx.body = { error: '服务器内部错误', details: err.message };
    }
  } else {
    await next();
  }
});

// 在server.js中添加以下代码（可以放在其他路由附近）
app.use(async (ctx, next) => {
    if (ctx.path === '/api/products' && ctx.method === 'GET') {
        try {
            const { code } = ctx.query;  // 改为使用code参数
            if (!code) {
                ctx.status = 400;
                ctx.body = { error: '商品码是必填项' };
                return;
            }

            const [rows] = await pool.query('SELECT * FROM products WHERE code = ?', [code]);
            
            if (rows.length === 0) {
                ctx.status = 404;
                ctx.body = { error: '未找到指定商品' };
            } else {
                const product = rows[0];
                // 解析attributes字段（如果它是JSON字符串）
                try {
                    product.attributes = typeof product.attributes === 'string' 
                        ? JSON.parse(product.attributes) 
                        : product.attributes;
                } catch (e) {
                    product.attributes = {};
                }
                ctx.body = product;
            }
        } catch (err) {
            console.error('查询商品出错:', err);
            ctx.status = 500;
            ctx.body = { error: '服务器内部错误' };
        }
    } else {
        await next();
    }
});

app.use(async (ctx, next) => {
    if (ctx.path === '/api/products' && ctx.method === 'POST') {
        try {
            const { code, name, category, attributes } = ctx.request.body;  // 添加code的解构

            if (!code || !name || !category) {
                ctx.status = 400;
                ctx.body = { error: '商品码、名称和分类是必填项' };
                return;
            }

            const [result] = await pool.execute(
                `INSERT INTO products (code, name, category, attributes) 
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                 code = VALUES(code), 
                 name = VALUES(name), 
                 category = VALUES(category), 
                 attributes = VALUES(attributes)`,
                [code, name, category, JSON.stringify(attributes)]
            );
            
            ctx.status = result.affectedRows === 1 ? 201 : 200;
            ctx.body = { 
                success: true,
                productId: result.insertId,
                action: result.affectedRows === 1 ? 'created' : 'updated'
            };
        } catch (err) {
            console.error('保存商品出错:', err);
            ctx.status = 500;
            ctx.body = { error: '服务器内部错误' };
        }
    } else {
        await next();
    }
});

// 获取所有供应商
app.use(async (ctx, next) => {
    if (ctx.path === '/api/suppliers' && ctx.method === 'GET') {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    id, 
                    name, 
                    contact_person, 
                    contact_phone, 
                    credit_rating, 
                    cooperation_status, 
                    latest_evaluation,
                    last_saleDate,
                    last_saleSum
                FROM suppliers 
                ORDER BY created_at DESC
            `);
            ctx.body = rows;
        } catch (err) {
            console.error('获取供应商列表出错:', err);
            ctx.status = 500;
            ctx.body = { error: '获取供应商列表失败' };
        }
    } else {
        await next();
    }
});

app.use(async (ctx, next) => {
    if (ctx.path === '/api/suppliers' && ctx.method === 'PUT') {
        try {
            const { name, credit_rating, cooperation_status, latest_evaluation } = ctx.request.body;

            if (!name) {
                ctx.status = 400;
                ctx.body = { error: '供应商名称是必填项' };
                return;
            }
            
            const [result] = await pool.execute(
                `UPDATE suppliers 
                 SET credit_rating = ?, cooperation_status = ?, latest_evaluation = ?
                 WHERE name = ?`,
                [credit_rating, cooperation_status, latest_evaluation, name]
            );
            
            if (result.affectedRows === 0) {
                ctx.status = 404;
                ctx.body = { error: '未找到指定供应商' };
            } else {
                ctx.body = { 
                    success: true,
                    message: '供应商信息更新成功'
                };
            }
        } catch (err) {
            console.error('更新供应商出错:', err);
            ctx.status = 500;
            ctx.body = { error: '服务器内部错误' };
        }
    } else {
        await next();
    }
});

// 获取所有采购订单
app.use(async (ctx, next) => {
    if (ctx.path === '/api/purchase-orders' && ctx.method === 'GET') {
        try {
            const [rows] = await pool.query(`
                SELECT 
                    po.id,
                    po.order_code,
                    po.status,
                    po.total_amount,
                    po.created_at,
                    po.approved_at,
                    po.approved_by,
                    po.rejection_reason,
                    po.notes,
                    s.name AS supplier_name
                FROM purchase_orders po
                LEFT JOIN suppliers s ON po.supplier_id = s.id
                ORDER BY po.created_at DESC
            `);
            ctx.body = rows;
        } catch (err) {
            console.error('获取采购订单列表出错:', err);
            ctx.status = 500;
            ctx.body = { error: '获取订单列表失败' };
        }
    } else {
        await next();
    }
});

// 获取单个订单详情
app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api/purchase-orders/') && ctx.method === 'GET' && !ctx.path.includes('/items')) {
        try {
            const orderId = ctx.path.split('/')[3];
            
            const [rows] = await pool.query(`
                SELECT * FROM purchase_orders 
                WHERE id = ?
            `, [orderId]);
            
            if (rows.length === 0) {
                ctx.status = 404;
                ctx.body = { error: '未找到指定订单' };
            } else {
                ctx.body = rows[0];
            }
        } catch (err) {
            ctx.status = 500;
            ctx.body = { error: '获取订单详情失败' };
        }
    } else {
        await next();
    }
});

// 获取订单商品明细
app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api/purchase-orders/') && ctx.method === 'GET' && ctx.path.includes('/items')) {
        try {
            const orderId = ctx.path.split('/')[3];
            
            const [rows] = await pool.query(`
                SELECT * FROM purchase_order_items 
                WHERE order_id = ?
            `, [orderId]);
            
            ctx.body = rows;
        } catch (err) {
            ctx.status = 500;
            ctx.body = { error: '获取订单商品失败' };
        }
    } else {
        await next();
    }
});

// 更新订单状态
app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api/purchase-orders/') && ctx.method === 'PUT') {
        try {
            const { status, approved_by, rejection_reason, notes } = ctx.request.body;
            const orderId = ctx.path.split('/')[3];

            const [result] = await pool.execute(
                `UPDATE purchase_orders 
                 SET status = ?, 
                     approved_by = ?, 
                     rejection_reason = ?, 
                     notes = ?,
                     approved_at = IF(status != ? AND ? = '已通过', NOW(), approved_at),
                     updated_at = NOW()
                 WHERE id = ?`,
                [status, approved_by, rejection_reason, notes, status, status, orderId]
            );
            
            if (result.affectedRows === 0) {
                ctx.status = 404;
                ctx.body = { success: false, error: '未找到指定订单' };
            } else {
                ctx.body = { 
                    success: true,
                    message: '订单状态更新成功',
                    affectedRows: result.affectedRows
                };
            }
        } catch (err) {
            console.error('更新订单状态失败:', err);
            ctx.status = 500;
            ctx.body = { success: false, error: '更新订单状态失败', details: err.message };
        }
    } else {
        await next();
    }
});

app.use(async (ctx) => {
  if (ctx.path === '/' || ctx.path === '/purchase.html') {
    try {
        const htmlPath = path.join(__dirname, '../purchase.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
      
      ctx.type = 'html';
      ctx.body = html;
    } catch (err) {
      ctx.status = 500;
      ctx.body = 'Internal Server Error';
      console.error('Error serving HTML file:', err);
    }
  } else {
    ctx.status = 404;
    ctx.body = 'Not Found';
  }
});

app.on('error', (err, ctx) => {
  console.error('Server error:', err, ctx);
});

app.listen(PORT, HOST, () => {
  console.log(`Purchase management system running at http://${HOST}:${PORT}`);
});