// server.js
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const fs = require('fs');
const path = require('path');

const app = new Koa();
const router = new Router();
const port = 3000;

app.use(cors());
app.use(bodyParser());

// 初始化数据存储
let procurementData = {
  goods: [
    { id: 1, name: '笔记本电脑 X1', category: 'electronics', attributes: [{name: '品牌', value: 'ThinkPad'}, {name: '型号', value: 'X1 Carbon'}] },
    { id: 2, name: '无线鼠标 M2', category: 'electronics', attributes: [{name: '品牌', value: 'Logitech'}, {name: '连接方式', value: '蓝牙'}] },
    { id: 3, name: 'A4打印纸', category: 'office', attributes: [{name: '规格', value: '80g'}, {name: '数量', value: '500张/包'}] }
  ],
  orders: [
    { id: 'PO-2309-001', supplier: '科技先锋有限公司', amount: 15000, status: 'pending', items: [{name: '笔记本电脑 X1', quantity: 10, price: 1200}, {name: '无线鼠标 M2', quantity: 20, price: 150}] },
    { id: 'PO-2309-002', supplier: '办公用品供应商', amount: 8500, status: 'approved', items: [{name: 'A4打印纸', quantity: 100, price: 25}, {name: '文件夹', quantity: 200, price: 3}] },
    { id: 'PO-2309-003', supplier: '工具设备公司', amount: 22000, status: 'pending', items: [{name: '电动工具套装', quantity: 5, price: 3500}, {name: '工具箱', quantity: 10, price: 450}] },
    { id: 'PO-2309-004', supplier: '原材料供应商', amount: 12500, status: 'approved', items: [{name: '钢材', quantity: 500, price: 25}] },
    { id: 'PO-2309-005', supplier: '科技先锋有限公司', amount: 18000, status: 'rejected', items: [{name: '显示器', quantity: 15, price: 1200}] }
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

// 商品管理API
router.get('/api/goods', (ctx) => {
  ctx.body = procurementData.goods;
});

router.post('/api/goods', (ctx) => {
  const newGood = {
    id: Date.now(),
    ...ctx.request.body
  };
  procurementData.goods.push(newGood);
  ctx.status = 201;
  ctx.body = newGood;
});

router.delete('/api/goods/:id', (ctx) => {
  const id = parseInt(ctx.params.id);
  procurementData.goods = procurementData.goods.filter(g => g.id !== id);
  ctx.status = 204;
});

// 采购订单API
router.get('/api/orders', (ctx) => {
  const status = ctx.query.status;
  let orders = procurementData.orders;
  
  if (status && status !== 'all') {
    orders = orders.filter(o => o.status === status);
  }
  
  ctx.body = orders;
});

router.get('/api/orders/:id', (ctx) => {
  const order = procurementData.orders.find(o => o.id === ctx.params.id);
  if (order) {
    ctx.body = order;
  } else {
    ctx.status = 404;
    ctx.body = { message: 'Order not found' };
  }
});

router.put('/api/orders/:id', (ctx) => {
  const id = ctx.params.id;
  const orderIndex = procurementData.orders.findIndex(o => o.id === id);
  
  if (orderIndex !== -1) {
    procurementData.orders[orderIndex] = {
      ...procurementData.orders[orderIndex],
      ...ctx.request.body
    };
    ctx.body = procurementData.orders[orderIndex];
  } else {
    ctx.status = 404;
    ctx.body = { message: 'Order not found' };
  }
});

// 库存管理API
router.get('/api/inventory', (ctx) => {
  const search = ctx.query.search;
  let inventory = procurementData.inventory;
  
  if (search) {
    const keyword = search.toLowerCase();
    inventory = inventory.filter(item => 
      item.name.toLowerCase().includes(keyword) || 
      item.warehouse.toLowerCase().includes(keyword)
    );
  }
  
  ctx.body = inventory;
});

router.post('/api/inventory/transfer', (ctx) => {
  const { goodsId, fromWarehouse, toWarehouse, quantity } = ctx.request.body;
  
  // 查找来源仓库库存
  const fromItem = procurementData.inventory.find(item => 
    item.id == goodsId && item.warehouse === fromWarehouse
  );
  
  if (!fromItem) {
    ctx.status = 404;
    ctx.body = { message: 'Source warehouse item not found' };
    return;
  }
  
  if (fromItem.current < quantity) {
    ctx.status = 400;
    ctx.body = { message: 'Insufficient stock in source warehouse' };
    return;
  }
  
  // 查找目标仓库库存
  let toItem = procurementData.inventory.find(item => 
    item.id == goodsId && item.warehouse === toWarehouse
  );
  
  // 如果目标仓库没有该商品，创建新记录
  if (!toItem) {
    const goods = procurementData.goods.find(g => g.id == goodsId);
    if (!goods) {
      ctx.status = 404;
      ctx.body = { message: 'Goods not found' };
      return;
    }
    
    toItem = {
      id: goodsId,
      name: goods.name,
      warehouse: toWarehouse,
      current: 0,
      safety: 0
    };
    procurementData.inventory.push(toItem);
  }
  
  // 更新库存
  fromItem.current -= quantity;
  toItem.current += quantity;
  
  ctx.body = { message: 'Inventory transfer successful' };
});

// 供应商管理API
router.get('/api/suppliers', (ctx) => {
  ctx.body = procurementData.suppliers;
});

router.put('/api/suppliers/:id', (ctx) => {
  const id = parseInt(ctx.params.id);
  const supplierIndex = procurementData.suppliers.findIndex(s => s.id === id);
  
  if (supplierIndex !== -1) {
    procurementData.suppliers[supplierIndex] = {
      ...procurementData.suppliers[supplierIndex],
      ...ctx.request.body
    };
    ctx.body = procurementData.suppliers[supplierIndex];
  } else {
    ctx.status = 404;
    ctx.body = { message: 'Supplier not found' };
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});