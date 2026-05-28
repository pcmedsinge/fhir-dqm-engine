"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../src/app.module");
describe('Health (e2e)', () => {
    let app;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });
    afterAll(async () => {
        await app.close();
    });
    it('GET /health returns 200 with status ok, version, and uptime', () => {
        return (0, supertest_1.default)(app.getHttpServer())
            .get('/health')
            .expect(200)
            .expect((res) => {
            expect(res.body.status).toBe('ok');
            expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
            expect(res.body.node).toMatch(/^v\d+/);
            expect(typeof res.body.uptime).toBe('number');
        });
    });
});
//# sourceMappingURL=app.e2e-spec.js.map