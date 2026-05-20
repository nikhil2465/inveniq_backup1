const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      // Required for SSE (Server-Sent Events) streaming to work through the dev proxy.
      // Without this, http-proxy-middleware buffers the response and tokens never arrive.
      selfHandleResponse: false,
      on: {
        proxyRes: (proxyRes) => {
          if ((proxyRes.headers['content-type'] || '').includes('text/event-stream')) {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          }
        },
      },
    })
  );
};
