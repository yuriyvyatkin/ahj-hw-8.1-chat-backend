const http = require('http');
const Koa = require('koa');
const Router = require('koa-router');
const WS = require('ws');
const koaBody = require('koa-body');

const app = new Koa();

app.use(async (ctx, next) => {
  const origin = ctx.request.get('Origin');
  if (!origin) {
    return await next();
  }

  const headers = { 'Access-Control-Allow-Origin': '*', };

  if (ctx.request.method !== 'OPTIONS') {
    ctx.response.set({ ...headers });
    try {
      return await next();
    } catch (e) {
      e.headers = { ...e.headers, ...headers };
      throw e;
    }
  }

  if (ctx.request.get('Access-Control-Request-Method')) {
    ctx.response.set({
      ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH',
    });

    if (ctx.request.get('Access-Control-Request-Headers')) {
      ctx.response.set('Access-Control-Allow-Headers', ctx.request.get('Access-Control-Request-Headers'));
    }

    ctx.response.status = 204;
  }
});

app.use(koaBody());

const router = new Router();

const port = process.env.PORT || 7070;
const server = http.createServer(app.callback())
const wsServer = new WS.Server({ server });

// "поздороваемся" с браузером
router.get('/check', async (ctx) => {
  ctx.response.body = 'hello';
  ctx.response.status = 200;
});

// создадим массив с именами пользователей для быстрого доступа и регистрации
const userNames = [];

// добавим нового пользователя
router.post('/users', async (ctx) => {
  const name = ctx.request.body.name;
  const lowerCasedName = name.toLowerCase();
  const nameExists = userNames.some((name) => {
    return name.toLowerCase() === lowerCasedName;
  });
  if (nameExists) {
    // если пользователь с введенным именем уже есть, то выбросим ошибку
    ctx.throw(400, 'User name already exists!')
  }
  userNames.push(name);
  ctx.response.status = 204;
});

app.use(router.routes()).use(router.allowedMethods());

// создадим коллекцию Map для хранения уникальных пар веб-сокет/имя клиента
const clients = new Map();

wsServer.on('connection', (ws) => {
  // добавим веб-сокет/имя нового пользователя в список клиентов
  clients.set(ws, userNames[userNames.length - 1]);

  // отправим новому клиенту и всем остальным новый список пользователей
  [...wsServer.clients]
    .filter(o => clients.has(o))
    .forEach(o => o.send(JSON.stringify(userNames)));

  ws.on('message', (msg) => {
    // поделимся каждым новым сообщением со всеми пользователями
    [...wsServer.clients]
      .filter(o => clients.has(o))
      .forEach(o => o.send(msg));
  });

  ws.on('close', function () {
    // найдем индекс имени пользователя, который вышел
    const quitedUserName = clients.get(ws);
    const userIndex = userNames.findIndex((userName) => userName === quitedUserName);

    // удалим данные пользователя из списка имен и клиентов
    userNames.splice(userIndex, 1);
    clients.delete(ws);

    // отправим оставшимся клиентам новый список пользователей
    [...wsServer.clients]
      .filter(o => clients.has(o))
      .forEach(o => o.send(JSON.stringify(userNames)));
  });
});

server.listen(port);
