// server.js
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const fs = require('fs').promises;
const path = require('path');

const app = new Koa();
const router = new Router();
const port = 3000;

app.use(cors());
app.use(bodyParser());

// 调试中间件 - 记录所有请求
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILES = {
  goods: path.join(DATA_DIR, 'goods.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  inventory: path.join(DATA_DIR, 'inventory.json'),
  suppliers: path.join(DATA_DIR, 'suppliers.json')
};

// 确保数据目录存在
async function ensureDataDirectory() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`数据目录已创建: ${DATA_DIR}`);
  } catch (err) {
    console.error('创建数据目录失败:', err);
  }
}

// 初始化数据文件
async function initializeDataFile(filePath, defaultValue = []) {
  try {
    await fs.access(filePath);
    console.log(`数据文件已存在: ${filePath}`);
  } catch (err) {
    try {
      await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2));
      console.log(`已创建数据文件: ${filePath}`);
    } catch (writeErr) {
      console.error(`创建数据文件失败: ${filePath}`, writeErr);
    }
  }
}

// 初始化数据存储
async function initializeData() {
  await ensureDataDirectory();
  
  const initialData = {
    goods: [
      { id: 1, name: '笔记本电脑 X1', category: 'electronics', attributes: [{name: '品牌', value: 'ThinkPad'}, {name: '型号', value: 'X1 Carbon'}] },
      { id: 2, name: '无线鼠标 M2', category: 'electronics', attributes: [{name: '品牌', value: 'Logitech'}, {name: '连接方式', value: '蓝牙'}] },
      { id: 3, name: 'A4打印纸', category: 'office', attributes: [{name: '规格', value: '80g'}, {name: '数量', value: '500张/包'}] }
    ],
    orders: [
      { id: 'PO-2309-001', supplier: '科技先锋有限公司', amount: 15000, status: 'pending', notes: '', items: [{name: '笔记本电脑 X1', quantity: 10, price: 1200}, {name: '无线鼠标 M2', quantity: 20, price: 150}] },
      { id: 'PO-2309-002', supplier: '办公用品供应商', amount: 8500, status: 'approved', notes: '', items: [{name: 'A4打印纸', quantity: 100, price: 25}, {name: '文件夹', quantity: 200, price: 3}] },
      { id: 'PO-2309-003', supplier: '工具设备公司', amount: 22000, status: 'pending', notes: '', items: [{name: '电动工具套装', quantity: 5, price: 3500}, {name: '工具箱', quantity: 10, price: 450}] },
      { id: 'PO-2309-004', supplier: '原材料供应商', amount: 12500, status: 'approved', notes: '', items: [{name: '钢材', quantity: 500, price: 25}] },
      { id: 'PO-2309-005', supplier: '科技先锋有限公司', amount: 18000, status: 'rejected', notes: '', items: [{name: '显示器', quantity: 15, price: 1200}] }
    ],
    inventory: [
      { id: 1, name: '笔记本电脑 X1', warehouse: '上海主仓', current: 150, safety: 200 },
      { id: 1, name: '笔记本电脑 X1', warehouse: '北京分仓', current: 80, safety: 100 },
      { id: 2, name: '无线鼠标 M2', warehouse: '上海主仓', current: 350, safety: 200 },
      { id: 2, name: '无线鼠标 M2', warehouse: '北京分仓', current: 850, safety: 500 },
      { id: 3, name: 'A4打印纸', warehouse: '上海主仓', current: 120, safety: 100 },
      { id: 3, name: 'A4打印纸', warehouse: '广州分仓', current: 200, safety: 150 }
    ],
    suppliers: [
      { id: 1, name: '科技先锋有限公司', status: 'active', credit: 'AAA', review: '交货准时，质量稳定', contact: '王经理 138-1234-5678', lastTransaction: {date: '2023-09-01', amount: 15000} },
      { id: 2, name: '办公用品供应商', status: 'active', credit: 'AA', review: '价格合理，服务周到', contact: '李经理 139-8765-4321', lastTransaction: {date: '2023-08-28', amount: 8500} },
      { id: 3, name: '工具设备公司', status: 'paused', credit: 'A', review: '产品质量好，但发货较慢', contact: '张经理 137-1122-3344', lastTransaction: {date: '2023-08-20', amount: 22000} },
      { id: 4, name: '原材料供应商', status: 'active', credit: 'B', review: '价格有优势，但偶尔有质量问题', contact: '刘经理 135-5566-7788', lastTransaction: {date: '2023-08-25', amount: 12500} }
    ]
  };

  await initializeDataFile(DATA_FILES.goods, initialData.goods);
  await initializeDataFile(DATA_FILES.orders, initialData.orders);
  await initializeDataFile(DATA_FILES.inventory, initialData.inventory);
  await initializeDataFile(DATA_FILES.suppliers, initialData.suppliers);
}

// 读取数据文件
async function readData(fileName) {
  try {
    const data = await fs.readFile(DATA_FILES[fileName], 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`读取${fileName}数据失败:`, err);
    return [];
  }
}

// 写入数据文件
async function writeData(fileName, data) {
  try {
    await fs.writeFile(DATA_FILES[fileName], JSON.stringify(data, null, 2));
    console.log(`成功写入${fileName}数据`);
  } catch (err) {
    console.error(`写入${fileName}数据失败:`, err);
  }
}

// 商品管理API
router.get('/api/goods', async (ctx) => {
  console.log('获取所有商品');
  ctx.body = await readData('goods');
});

router.post('/api/goods', async (ctx) => {
  console.log('创建新商品');
  const goods = await readData('goods');
  const newGood = {
    id: Date.now(),
    ...ctx.request.body
  };
  goods.push(newGood);
  await writeData('goods', goods);
  ctx.status = 201;
  ctx.body = newGood;
});

router.delete('/api/goods/:id', async (ctx) => {
  const id = parseInt(ctx.params.id);
  console.log(`删除商品 ID: ${id}`);
  
  const goods = await readData('goods');
  const initialLength = goods.length;
  
  const filteredGoods = goods.filter(g => g.id !== id);
  
  if (filteredGoods.length < initialLength) {
    await writeData('goods', filteredGoods);
    ctx.status = 204;
  } else {
    ctx.status = 404;
    ctx.body = { message: '未找到商品' };
  }
});

// 采购订单API
router.get('/api/orders', async (ctx) => {
  const status = ctx.query.status;
  console.log(`获取订单，状态: ${status || 'all'}`);
  
  const orders = await readData('orders');
  
  if (status && status !== 'all') {
    ctx.body = orders.filter(o => o.status === status);
  } else {
    ctx.body = orders;
  }
});

router.get('/api/orders/:id', async (ctx) => {
  const id = ctx.params.id;
  console.log(`获取订单详情 ID: ${id}`);
  
  const orders = await readData('orders');
  const order = orders.find(o => o.id === id);
  
  if (order) {
    ctx.body = order;
  } else {
    ctx.status = 404;
    ctx.body = { message: '未找到订单' };
  }
});

router.put('/api/orders/:id', async (ctx) => {
  const id = ctx.params.id;
  console.log(`更新订单 ID: ${id}`);
  
  const orders = await readData('orders');
  const orderIndex = orders.findIndex(o => o.id === id);
  
  if (orderIndex !== -1) {
    orders[orderIndex] = {
      ...orders[orderIndex],
      ...ctx.request.body
    };
    await writeData('orders', orders);
    ctx.body = orders[orderIndex];
  } else {
    ctx.status = 404;
    ctx.body = { message: '未找到订单' };
  }
});

// 库存管理API
router.get('/api/inventory', async (ctx) => {
  const search = ctx.query.search;
  console.log(`获取库存，搜索: ${search || '无'}`);
  
  const inventory = await readData('inventory');
  
  if (search) {
    const keyword = search.toLowerCase();
    ctx.body = inventory.filter(item => 
      item.name.toLowerCase().includes(keyword) || 
      item.warehouse.toLowerCase().includes(keyword)
    );
  } else {
    ctx.body = inventory;
  }
});

router.post('/api/inventory/transfer', async (ctx) => {
  const { goodsId, fromWarehouse, toWarehouse, quantity } = ctx.request.body;
  console.log(`库存调拨: 商品ID ${goodsId}, 从 ${fromWarehouse} 到 ${toWarehouse}, 数量 ${quantity}`);
  
  const inventory = await readData('inventory');
  
  // 查找来源仓库库存
  const fromItem = inventory.find(item => 
    item.id == goodsId && item.warehouse === fromWarehouse
  );
  
  if (!fromItem) {
    ctx.status = 404;
    ctx.body = { message: '未找到来源仓库的商品' };
    return;
  }
  
  if (fromItem.current < quantity) {
    ctx.status = 400;
    ctx.body = { message: '来源仓库库存不足' };
    return;
  }
  
  // 查找目标仓库库存
  let toItem = inventory.find(item => 
    item.id == goodsId && item.warehouse === toWarehouse
  );
  
  // 如果目标仓库没有该商品，创建新记录
  if (!toItem) {
    const goods = await readData('goods');
    const good = goods.find(g => g.id == goodsId);
    
    if (!good) {
      ctx.status = 404;
      ctx.body = { message: '未找到商品' };
      return;
    }
    
    toItem = {
      id: goodsId,
      name: good.name,
      warehouse: toWarehouse,
      current: 0,
      safety: 0
    };
    inventory.push(toItem);
  }
  
  // 更新库存
  fromItem.current -= quantity;
  toItem.current += quantity;
  
  await writeData('inventory', inventory);
  ctx.body = { message: '库存调拨成功' };
});

// 供应商管理API
router.get('/api/suppliers', async (ctx) => {
  console.log('获取所有供应商');
  ctx.body = await readData('suppliers');
});

router.put('/api/suppliers/:id', async (ctx) => {
  const id = parseInt(ctx.params.id);
  console.log(`更新供应商 ID: ${id}`);
  
  const suppliers = await readData('suppliers');
  const supplierIndex = suppliers.findIndex(s => s.id === id);
  
  if (supplierIndex !== -1) {
    suppliers[supplierIndex] = {
      ...suppliers[supplierIndex],
      ...ctx.request.body
    };
    await writeData('suppliers', suppliers);
    ctx.body = suppliers[supplierIndex];
  } else {
    ctx.status = 404;
    ctx.body = { message: '未找到供应商' };
  }
});

// 使用路由中间件
app.use(router.routes());
app.use(router.allowedMethods());

// 处理前端HTML文件请求
app.use(async (ctx) => {
  if (ctx.method === 'GET' && (ctx.path === '/' || ctx.path === '/index.html' || ctx.path === '/purchase.html')) {
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
    // 处理未匹配的路由
    ctx.status = 404;
    ctx.body = 'Not Found';
  }
});

// 启动服务器
async function startServer() {
  try {
    await initializeData();
    app.listen(port, () => {
      console.log(`服务器运行在 http://localhost:${port}`);
      console.log('数据文件位置:');
      console.log(`  商品: ${DATA_FILES.goods}`);
      console.log(`  订单: ${DATA_FILES.orders}`);
      console.log(`  库存: ${DATA_FILES.inventory}`);
      console.log(`  供应商: ${DATA_FILES.suppliers}`);
    });
  } catch (err) {
    console.error('服务器启动失败:', err);
  }
}

startServer();