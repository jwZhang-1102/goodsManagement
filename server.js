const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const app = new Koa();
const router = new Router();

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'your_password',
    database: 'your_database_name',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.use(bodyParser());

app.use(async (ctx, next) => {
    try {
        await next();
        if (ctx.status === 404 && !ctx.body) {
            ctx.body = 'Not Found';
        }
    } catch (err) {
        console.error('Server error:', err);
        ctx.status = err.status || 500;
        ctx.body = { error: err.message || 'Internal Server Error' };
    }
});

// =====================================
// 产品管理API
// =====================================

// 添加产品
router.post('/products', async (ctx) => {
    const { name, category, unit, price, stock } = ctx.request.body;
    if (!name || !category || !unit || !price || stock === undefined) {
        ctx.status = 400;
        ctx.body = { error: '缺少必要的产品信息' };
        return;
    }
    try {
        const [result] = await pool.execute(
            `INSERT INTO products (name, category, unit, price, stock) VALUES (?, ?, ?, ?, ?)`,
            [name, category, unit, price, stock]
        );
        ctx.status = 201;
        ctx.body = { success: true, message: '产品添加成功', id: result.insertId };
    } catch (err) {
        console.error('添加产品出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 获取所有产品
router.get('/products', async (ctx) => {
    try {
        const [rows] = await pool.execute(`SELECT * FROM products`);
        ctx.body = rows;
    } catch (err) {
        console.error('获取产品列表出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 更新产品
router.put('/products/:name', async (ctx) => {
    const productName = ctx.params.name;
    const { category, unit, price, stock } = ctx.request.body;
    if (!category || !unit || !price || stock === undefined) {
        ctx.status = 400;
        ctx.body = { error: '缺少必要的产品更新信息' };
        return;
    }
    try {
        const [result] = await pool.execute(
            `UPDATE products SET category = ?, unit = ?, price = ?, stock = ? WHERE name = ?`,
            [category, unit, price, stock, productName]
        );
        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { error: '未找到指定产品' };
        } else {
            ctx.body = { success: true, message: '产品信息更新成功' };
        }
    } catch (err) {
        console.error('更新产品出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 删除产品
router.delete('/products/:name', async (ctx) => {
    const productName = ctx.params.name;
    try {
        const [result] = await pool.execute(
            `DELETE FROM products WHERE name = ?`,
            [productName]
        );
        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { error: '未找到指定产品' };
        } else {
            ctx.body = { success: true, message: '产品删除成功' };
        }
    } catch (err) {
        console.error('删除产品出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// =====================================
// 供应商管理API
// =====================================

// 添加供应商
router.post('/suppliers', async (ctx) => {
    const { name, contact_person, phone_number, email, address, credit_rating, cooperation_status, latest_evaluation } = ctx.request.body;
    if (!name || !contact_person || !phone_number || !email || !address) {
        ctx.status = 400;
        ctx.body = { error: '缺少必要的供应商信息' };
        return;
    }
    try {
        const [result] = await pool.execute(
            `INSERT INTO suppliers (name, contact_person, phone_number, email, address, credit_rating, cooperation_status, latest_evaluation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, contact_person, phone_number, email, address, credit_rating || null, cooperation_status || null, latest_evaluation || null]
        );
        ctx.status = 201;
        ctx.body = { success: true, message: '供应商添加成功', id: result.insertId };
    } catch (err) {
        console.error('添加供应商出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 获取所有供应商
router.get('/suppliers', async (ctx) => {
    try {
        const [rows] = await pool.execute(`SELECT * FROM suppliers`);
        ctx.body = rows;
    } catch (err) {
        console.error('获取供应商列表出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 更新供应商
router.put('/suppliers/:name', async (ctx) => {
    const supplierName = ctx.params.name;
    const { credit_rating, cooperation_status, latest_evaluation } = ctx.request.body;
    if (credit_rating === undefined && cooperation_status === undefined && latest_evaluation === undefined) {
        ctx.status = 400;
        ctx.body = { error: '缺少必要的供应商更新信息' };
        return;
    }
    try {
        const [result] = await pool.execute(
            `UPDATE suppliers SET credit_rating = ?, cooperation_status = ?, latest_evaluation = ? WHERE name = ?`,
            [credit_rating || null, cooperation_status || null, latest_evaluation || null, supplierName]
        );
        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { error: '未找到指定供应商' };
        } else {
            ctx.body = { success: true, message: '供应商信息更新成功' };
        }
    } catch (err) {
        console.error('更新供应商出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 删除供应商
router.delete('/suppliers/:name', async (ctx) => {
    const supplierName = ctx.params.name;
    try {
        const [result] = await pool.execute(
            `DELETE FROM suppliers WHERE name = ?`,
            [supplierName]
        );
        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { error: '未找到指定供应商' };
        } else {
            ctx.body = { success: true, message: '供应商删除成功' };
        }
    } catch (err) {
        console.error('删除供应商出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});


// =====================================
// 采购订单管理API
// =====================================

// 创建采购订单
router.post('/purchase-orders', async (ctx) => {
    const { supplier_name, order_date, delivery_date, notes, items } = ctx.request.body;
    if (!supplier_name || !order_date || !Array.isArray(items) || items.length === 0) {
        ctx.status = 400;
        ctx.body = { error: '缺少必要的采购订单信息或订单项为空' };
        return;
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction(); // 开始事务

        let totalAmount = 0;
        // 计算总金额并校验每个订单项
        for (const item of items) {
            if (!item.product_name || !item.quantity || !item.unit_price) {
                ctx.status = 400;
                ctx.body = { error: '订单项信息不完整' };
                await connection.rollback();
                return;
            }
            item.item_total = item.quantity * item.unit_price;
            totalAmount += item.item_total;
        }

        // 插入采购订单主信息
        const [orderResult] = await connection.execute(
            `INSERT INTO purchase_orders (supplier_name, order_date, delivery_date, total_amount, notes) VALUES (?, ?, ?, ?, ?)`,
            [supplier_name, order_date, delivery_date || null, totalAmount, notes || null]
        );
        const orderId = orderResult.insertId;

        // 插入采购订单项
        for (const item of items) {
            await connection.execute(
                `INSERT INTO purchase_order_items (order_id, product_name, quantity, unit_price, item_total) VALUES (?, ?, ?, ?, ?)`,
                [orderId, item.product_name, item.quantity, item.unit_price, item.item_total]
            );
        }

        await connection.commit(); // 提交事务
        ctx.status = 201;
        ctx.body = { success: true, message: '采购订单创建成功', order_id: orderId };
    } catch (err) {
        if (connection) {
            await connection.rollback(); // 发生错误时回滚事务
        }
        console.error('创建采购订单出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// 获取所有采购订单 (可以包含订单项)
router.get('/purchase-orders', async (ctx) => {
    try {
        const [orders] = await pool.execute(`SELECT * FROM purchase_orders ORDER BY created_at DESC`);

        // 如果需要获取每个订单的详细项
        for (const order of orders) {
            const [items] = await pool.execute(
                `SELECT * FROM purchase_order_items WHERE order_id = ?`,
                [order.id]
            );
            order.items = items;
        }
        ctx.body = orders;
    } catch (err) {
        console.error('获取采购订单列表出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 获取单个采购订单及其详情
router.get('/purchase-orders/:id', async (ctx) => {
    const orderId = ctx.params.id;
    try {
        const [orders] = await pool.execute(
            `SELECT * FROM purchase_orders WHERE id = ?`,
            [orderId]
        );
        if (orders.length === 0) {
            ctx.status = 404;
            ctx.body = { error: '未找到指定采购订单' };
            return;
        }
        const order = orders[0];

        const [items] = await pool.execute(
            `SELECT * FROM purchase_order_items WHERE order_id = ?`,
            [orderId]
        );
        order.items = items;

        ctx.body = order;
    } catch (err) {
        console.error('获取单个采购订单出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// 更新采购订单 (包含主信息和订单项的增删改)
router.put('/purchase-orders/:id', async (ctx) => {
    const orderId = ctx.params.id;
    const { supplier_name, order_date, delivery_date, status, notes, items } = ctx.request.body;

    if (!supplier_name && !order_date && !delivery_date && !status && !notes && (!items || !Array.isArray(items))) {
        ctx.status = 400;
        ctx.body = { error: '缺少必要的采购订单更新信息' };
        return;
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction(); // 开始事务

        // 1. 更新采购订单主信息 (如果提供了相关字段)
        let updateFields = [];
        let updateValues = [];

        if (supplier_name !== undefined) { updateFields.push('supplier_name = ?'); updateValues.push(supplier_name); }
        if (order_date !== undefined) { updateFields.push('order_date = ?'); updateValues.push(order_date); }
        if (delivery_date !== undefined) { updateFields.push('delivery_date = ?'); updateValues.push(delivery_date); }
        if (status !== undefined) { updateFields.push('status = ?'); updateValues.push(status); }
        if (notes !== undefined) { updateFields.push('notes = ?'); updateValues.push(notes); }

        if (updateFields.length > 0) {
            updateValues.push(orderId);
            await connection.execute(
                `UPDATE purchase_orders SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );
        }

        // 2. 处理订单项的增删改 (如果提供了 items 数组)
        if (Array.isArray(items)) {
            // 获取当前数据库中的订单项
            const [existingItems] = await connection.execute(
                `SELECT id, product_name, quantity, unit_price FROM purchase_order_items WHERE order_id = ?`,
                [orderId]
            );
            const existingItemMap = new Map(existingItems.map(item => [item.id, item])); // 用ID做映射方便查找

            let newTotalAmount = 0; // 用于重新计算总金额

            // 遍历前端传来的订单项
            for (const newItem of items) {
                if (!newItem.product_name || !newItem.quantity || !newItem.unit_price) {
                    ctx.status = 400;
                    ctx.body = { error: '更新订单项信息不完整' };
                    await connection.rollback();
                    return;
                }
                const newItemTotal = newItem.quantity * newItem.unit_price;
                newTotalAmount += newItemTotal;

                if (newItem.id && existingItemMap.has(newItem.id)) {
                    // 修改现有订单项
                    const oldItem = existingItemMap.get(newItem.id);
                    if (oldItem.product_name !== newItem.product_name ||
                        oldItem.quantity !== newItem.quantity ||
                        oldItem.unit_price !== newItem.unit_price) {
                        await connection.execute(
                            `UPDATE purchase_order_items SET product_name = ?, quantity = ?, unit_price = ?, item_total = ? WHERE id = ? AND order_id = ?`,
                            [newItem.product_name, newItem.quantity, newItem.unit_price, newItemTotal, newItem.id, orderId]
                        );
                    }
                    existingItemMap.delete(newItem.id); // 从Map中移除已处理的项
                } else {
                    // 新增订单项
                    await connection.execute(
                        `INSERT INTO purchase_order_items (order_id, product_name, quantity, unit_price, item_total) VALUES (?, ?, ?, ?, ?)`,
                        [orderId, newItem.product_name, newItem.quantity, newItem.unit_price, newItemTotal]
                    );
                }
            }

            // 删除在前端列表中不存在的订单项
            for (const [idToDelete, itemToDelete] of existingItemMap) {
                await connection.execute(
                    `DELETE FROM purchase_order_items WHERE id = ? AND order_id = ?`,
                    [idToDelete, orderId]
                );
            }

            // 更新主订单的总金额
            await connection.execute(
                `UPDATE purchase_orders SET total_amount = ? WHERE id = ?`,
                [newTotalAmount, orderId]
            );
        } else if (items !== undefined && !Array.isArray(items)) {
             // 如果items存在但不是数组，说明前端传递了错误的数据格式
            ctx.status = 400;
            ctx.body = { error: '订单项 (items) 必须是一个数组' };
            await connection.rollback();
            return;
        }

        await connection.commit(); // 提交事务
        ctx.body = { success: true, message: '采购订单更新成功' };
    } catch (err) {
        if (connection) {
            await connection.rollback(); // 发生错误时回滚事务
        }
        console.error('更新采购订单出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


// 删除采购订单 (会级联删除订单项，因为 purchase_order_items 表外键设置了 ON DELETE CASCADE)
router.delete('/purchase-orders/:id', async (ctx) => {
    const orderId = ctx.params.id;
    try {
        const [result] = await pool.execute(
            `DELETE FROM purchase_orders WHERE id = ?`,
            [orderId]
        );
        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { error: '未找到指定采购订单' };
        } else {
            ctx.body = { success: true, message: '采购订单删除成功' };
        }
    } catch (err) {
        console.error('删除采购订单出错:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
});

// =====================================
// 静态文件服务和首页路由
// =====================================

// 将路由应用到 Koa 应用
app.use(router.routes()).use(router.allowedMethods());

// 处理 /index.html 和 /purchase.html 的请求，提供前端HTML文件
app.use(async (ctx) => {
    if (ctx.path === '/' || ctx.path === '/purchase.html') {
        try {
            const htmlFileName = ctx.path === '/' ? 'index.html' : 'purchase.html';
            const htmlPath = path.join(__dirname, htmlFileName);

            // 检查文件是否存在
            if (!fs.existsSync(htmlPath)) {
                ctx.status = 404;
                ctx.body = `HTML file not found: ${htmlFileName}`;
                return;
            }

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

// 应用程序错误事件监听
app.on('error', (err, ctx) => {
    console.error('app error', err.stack);
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, HOST, () => {
    console.log(`Purchase management system running at http://${HOST}:${PORT}`);
});