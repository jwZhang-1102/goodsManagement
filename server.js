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

app.use(async (ctx, next) => {
    if (ctx.path === '/api/products' && ctx.method === 'POST') {
        try {
            const { name, category, attributes } = ctx.request.body;

            if (!name || !category) {
                ctx.status = 400;
                ctx.body = { error: '商品名称和分类是必填项' };
                return;
            }

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

// 获取所有供应商
app.use(async (ctx, next) => {
    if (ctx.path === '/api/suppliers' && ctx.method === 'GET') {
        try {
            const [rows] = await pool.query('SELECT * FROM suppliers');
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