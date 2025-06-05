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
    user: 'root', // 替换为你的MySQL用户名
    password: '123456', // 替换为你的MySQL密码
    database: 'purchase_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const PORT = 3030;
const HOST = '127.0.0.1';

app.use(static(path.join(__dirname, '../')));
app.use(bodyParser());

// API路由 - 保存商品
app.use(async (ctx, next) => {
    if (ctx.path === '/api/products' && ctx.method === 'POST') {
        try {
            const { name, category, attributes } = ctx.request.body;
            
            // 验证输入
            if (!name || !category) {
                ctx.status = 400;
                ctx.body = { error: '商品名称和分类是必填项' };
                return;
            }
            
            // 插入数据库
            const [result] = await pool.execute(
                'INSERT INTO products (name, category, attributes) VALUES (?, ?, ?)',
                [name, category, JSON.stringify(attributes)]
            );
            
            ctx.status = 201;
            ctx.body = { 
                success: true,
                productId: result.insertId 
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

// API路由 - 保存商品
app.use(async (ctx, next) => {
    if (ctx.path === '/api/products' && ctx.method === 'POST') {
        try {
            const { name, category, attributes } = ctx.request.body;

            // 验证输入
            if (!name || !category) {
                ctx.status = 400;
                ctx.body = { error: '商品名称和分类是必填项' };
                return;
            }

            // 插入数据库
            const [result] = await pool.execute(
                'INSERT INTO products (name, category, attributes) VALUES (?, ?, ?)',
                [name, category, JSON.stringify(attributes)]
            );

            ctx.status = 201;
            ctx.body = {
                success: true,
                productId: result.insertId
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

// 新增 API 路由 - 获取所有商品列表（用于 loadGoodsForTransfer）
app.use(async (ctx, next) => {
    if (ctx.path === '/api/goods' && ctx.method === 'GET') {
        try {
            const [rows] = await pool.execute('SELECT id, name FROM products');
            ctx.status = 200;
            ctx.body = rows;
        } catch (err) {
            console.error('获取商品列表出错:', err);
            ctx.status = 500;
            ctx.body = { error: '服务器内部错误' };
        }
    } else {
        await next();
    }
});

// 新增 API 路由 - 获取库存数据（用于 loadInventory 和 searchInventory）
app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api/inventory') && ctx.method === 'GET') {
        try {
            const searchQuery = ctx.query.search;
            let sql = `
                SELECT 
                    i.id, 
                    p.name, 
                    i.warehouse, 
                    i.current_stock as current, 
                    i.safety_stock as safety 
                FROM 
                    inventory i
                JOIN 
                    products p ON i.product_id = p.id
            `;
            const params = [];

            if (searchQuery) {
                sql += ' WHERE p.name LIKE ? OR p.id LIKE ?';
                params.push(`%${searchQuery}%`, `%${searchQuery}%`);
            }

            const [rows] = await pool.execute(sql, params);
            ctx.status = 200;
            ctx.body = rows;
        } catch (err) {
            console.error('获取库存数据出错:', err);
            ctx.status = 500;
            ctx.body = { error: '服务器内部错误' };
        }
    } else {
        await next();
    }
});

// 新增 API 路由 - 提交库存调拨（用于 submitTransfer）
app.use(async (ctx, next) => {
    if (ctx.path === '/api/inventory/transfer' && ctx.method === 'POST') {
        try {
            const { goodsId, fromWarehouse, toWarehouse, quantity } = ctx.request.body;

            // 验证输入
            if (!goodsId || !fromWarehouse || !toWarehouse || !quantity || quantity <= 0) {
                ctx.status = 400;
                ctx.body = { error: '请填写完整的调拨信息，数量必须大于0' };
                return;
            }

            if (fromWarehouse === toWarehouse) {
                ctx.status = 400;
                ctx.body = { error: '来源仓库和目标仓库不能相同' };
                return;
            }

            // 检查来源仓库库存是否足够
            const [fromInventory] = await pool.execute(
                'SELECT current_stock FROM inventory WHERE product_id = ? AND warehouse = ?',
                [goodsId, fromWarehouse]
            );

            if (fromInventory.length === 0 || fromInventory[0].current_stock < quantity) {
                ctx.status = 400;
                ctx.body = { error: '来源仓库库存不足' };
                return;
            }

            // 开始事务
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();

                // 减少来源仓库库存
                await connection.execute(
                    'UPDATE inventory SET current_stock = current_stock - ? WHERE product_id = ? AND warehouse = ?',
                    [quantity, goodsId, fromWarehouse]
                );

                // 增加目标仓库库存，如果不存在则插入
                const [toInventory] = await connection.execute(
                    'SELECT id FROM inventory WHERE product_id = ? AND warehouse = ?',
                    [goodsId, toWarehouse]
                );

                if (toInventory.length > 0) {
                    await connection.execute(
                        'UPDATE inventory SET current_stock = current_stock + ? WHERE product_id = ? AND warehouse = ?',
                        [quantity, goodsId, toWarehouse]
                    );
                } else {
                    // 假设 safety_stock 默认值为 10，实际应用中可能需要更复杂的逻辑
                    await connection.execute(
                        'INSERT INTO inventory (product_id, warehouse, current_stock, safety_stock) VALUES (?, ?, ?, ?)',
                        [goodsId, toWarehouse, quantity, 10]
                    );
                }

                await connection.commit();
                ctx.status = 200;
                ctx.body = { success: true, message: '库存调拨成功' };

            } catch (transactionError) {
                await connection.rollback();
                console.error('库存调拨事务失败:', transactionError);
                ctx.status = 500;
                ctx.body = { error: '库存调拨失败，请重试' };
            } finally {
                connection.release();
            }

        } catch (err) {
            console.error('提交调拨出错:', err);
            ctx.status = 500;
            ctx.body = { error: '服务器内部错误' };
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
