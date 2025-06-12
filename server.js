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