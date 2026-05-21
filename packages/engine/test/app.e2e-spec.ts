import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with status ok, version, and uptime', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res: request.Response) => {
        expect((res.body as { status: string }).status).toBe('ok');
        expect((res.body as { version: string }).version).toMatch(/^\d+\.\d+\.\d+/);
        expect((res.body as { node: string }).node).toMatch(/^v\d+/);
        expect(typeof (res.body as { uptime: number }).uptime).toBe('number');
      });
  });
});
