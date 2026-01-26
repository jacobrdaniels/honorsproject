import { Router } from 'express';

const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'portfolio-backend',
  });
});

export default healthRouter;
