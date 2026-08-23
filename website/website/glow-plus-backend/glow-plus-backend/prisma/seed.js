"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEED = void 0;
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
const SALT_ROUNDS = 12;
exports.SEED = {
    merchant: { email: 'merchant@glowplus.test', password: 'Merchant123!' },
    consumer: { email: 'consumer@glowplus.test', password: 'Consumer123!' },
};
function assertLocalDatabase() {
    const url = process.env.DATABASE_URL ?? '';
    const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres)[:/]/.test(url);
    if (!isLocal) {
        throw new Error('Refusing to seed: DATABASE_URL does not point at a local database.\n' +
            'This script creates accounts with known weak passwords and must never ' +
            'run against staging or production.');
    }
}
async function main() {
    assertLocalDatabase();
    const [merchantHash, consumerHash] = await Promise.all([
        bcrypt.hash(exports.SEED.merchant.password, SALT_ROUNDS),
        bcrypt.hash(exports.SEED.consumer.password, SALT_ROUNDS),
    ]);
    const merchant = await prisma.merchant.upsert({
        where: { email: exports.SEED.merchant.email },
        update: { status: 'ACTIVE', emailVerifiedAt: new Date() },
        create: {
            businessName: 'Glow Salon (Seed)',
            email: exports.SEED.merchant.email,
            passwordHash: merchantHash,
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            foundingMember: true,
        },
    });
    const user = await prisma.user.upsert({
        where: { email: exports.SEED.consumer.email },
        update: { emailVerifiedAt: new Date() },
        create: {
            email: exports.SEED.consumer.email,
            name: 'Seed Consumer',
            passwordHash: consumerHash,
            emailVerifiedAt: new Date(),
        },
    });
    const styleSpecs = [
        { name: 'Balayage', type: 'HAIR', pointsPerVisit: 50, durationMinutes: 90 },
        { name: 'French Tip Gel', type: 'NAIL', pointsPerVisit: 20, durationMinutes: 45 },
        { name: 'Deep Tissue Massage', type: 'SPA', pointsPerVisit: 40, durationMinutes: 60 },
    ];
    const styles = [];
    for (const spec of styleSpecs) {
        const existing = await prisma.style.findFirst({
            where: { merchantId: merchant.id, name: spec.name },
        });
        styles.push(existing
            ? await prisma.style.update({ where: { id: existing.id }, data: spec })
            : await prisma.style.create({ data: { ...spec, merchantId: merchant.id, active: true } }));
    }
    const ruleSpecs = [
        {
            name: '5 Visits = 15% Off',
            triggerType: 'VISIT_COUNT',
            triggerValue: 5,
            rewardType: 'PERCENT_OFF',
            rewardValue: 15,
        },
        {
            name: '200 Points = $20 Off',
            triggerType: 'POINTS_THRESHOLD',
            triggerValue: 200,
            rewardType: 'FLAT_DISCOUNT',
            rewardValue: 2000,
        },
    ];
    for (const spec of ruleSpecs) {
        const existing = await prisma.rewardRule.findFirst({
            where: { merchantId: merchant.id, name: spec.name },
        });
        if (!existing) {
            await prisma.rewardRule.create({ data: { ...spec, merchantId: merchant.id, active: true } });
        }
    }
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
        const closed = dayOfWeek === 0;
        await prisma.businessHours.upsert({
            where: { merchantId_dayOfWeek: { merchantId: merchant.id, dayOfWeek } },
            update: { openTime: '09:00', closeTime: '17:00', closed },
            create: { merchantId: merchant.id, dayOfWeek, openTime: '09:00', closeTime: '17:00', closed },
        });
    }
    const counts = {
        merchants: await prisma.merchant.count(),
        users: await prisma.user.count(),
        styles: await prisma.style.count({ where: { merchantId: merchant.id } }),
        rewardRules: await prisma.rewardRule.count({ where: { merchantId: merchant.id } }),
        businessHours: await prisma.businessHours.count({ where: { merchantId: merchant.id } }),
    };
    console.log('Seed complete.\n');
    console.log('  merchant :', exports.SEED.merchant.email, '/', exports.SEED.merchant.password, `(id ${merchant.id})`);
    console.log('  consumer :', exports.SEED.consumer.email, '/', exports.SEED.consumer.password, `(id ${user.id})`);
    console.log('  styleId  :', styles[0].id, `(${styles[0].name}, ${styles[0].durationMinutes}min)`);
    console.log('\n  row counts:', JSON.stringify(counts));
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map