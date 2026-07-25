import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  REQUIRED_OPENROUTER_MODEL,
  requestOpenRouter,
} from '../functions/openRouterClient.js';
import {
  buildPrivateModelRequest,
  mergeDeterministicEvidence,
  validateAssistantDisclosure,
} from '../functions/privacyContext.js';
import { createDemoDocuments } from './seed-emulators.mjs';

const AS_OF_DATE = '2026-07-25';
const THAI_TEXT = /[\u0E00-\u0E7F]/u;
const SYNTHETIC_CANARIES = [
  'Mock Student 0041',
  'demo-0041',
  'Alpha-1',
  'synthetic-canary@example.test',
  '081-234-5678',
];

const CASES = Object.freeze([
  {
    id: 'overview',
    question: 'สรุปภาพรวมและจุดที่ควรติดตามวันนี้',
    expectedType: 'local-derived',
    expectLocal: true,
    expectTable: false,
    expectChart: false,
  },
  {
    id: 'risk-overview',
    question: 'สรุปความเสี่ยงภาพรวม',
    expectedType: 'overview',
    expectTable: false,
    expectChart: false,
  },
  {
    id: 'coverage',
    question: 'ข้อมูลถึงวันไหนและครอบคลุมกี่คน',
    expectedType: 'local-derived',
    expectLocal: true,
    expectTable: false,
    expectChart: false,
  },
  {
    id: 'week-comparison',
    question: 'ค่า Self จาก Wk 7 เป็น Wk 8 เปลี่ยนเท่าไร',
    expectedType: 'local-derived',
    expectLocal: true,
    expectTable: false,
    expectChart: false,
  },
  {
    id: 'room-chart',
    question: 'สรุปแยกตามห้องเป็นกราฟ',
    expectedType: 'local-derived',
    expectLocal: true,
    expectTable: false,
    expectChart: true,
  },
  {
    id: 'review-ranking',
    question: 'ขอ 5 คนที่ควรติดตาม',
    expectedType: 'local-derived',
    expectLocal: true,
    expectTable: true,
    expectChart: false,
  },
  {
    id: 'individual',
    question: 'วิเคราะห์ Mock Student 0041',
    expectedType: 'local-derived',
    expectLocal: true,
    expectTable: false,
    expectChart: false,
  },
  {
    id: 'forecast',
    question: 'Self อีก 4 สัปดาห์จะเป็นเท่าไร',
    expectedType: 'local-derived',
    expectLocal: true,
    expectTable: false,
    expectChart: false,
    expectMethod: true,
  },
  {
    id: 'negation',
    question: 'ไม่ต้องคาดการณ์และไม่ต้องแสดงกราฟ แค่สรุปข้อมูลเดิม',
    expectedType: 'overview',
    expectTable: false,
    expectChart: false,
  },
]);

function readArgument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function parseReasoningEffort() {
  const value = readArgument('--reasoning', 'none');
  if (value === 'none') return null;
  if (value === 'high' || value === 'xhigh') return value;
  throw new Error('Use --reasoning none, high, or xhigh');
}

function parseTemperature() {
  const value = Number(readArgument('--temperature', '0.1'));
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Use --temperature between 0 and 1');
  }
  return value;
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadApiKey() {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  let content;
  try {
    content = await readFile(
      new URL('../functions/.secret.local', import.meta.url),
      'utf8',
    );
  } catch {
    throw new Error(
      'OPENROUTER_API_KEY is unavailable in the environment or functions/.secret.local',
    );
  }
  const line = content
    .split(/\r?\n/u)
    .find(entry => /^\s*OPENROUTER_API_KEY\s*=/u.test(entry));
  const value = line ? unquote(line.replace(/^\s*OPENROUTER_API_KEY\s*=/u, '')) : '';
  if (!value) throw new Error('OPENROUTER_API_KEY is empty');
  return value;
}

function createSyntheticDataset() {
  const streams = createDemoDocuments({ studentCount: 250 });
  return {
    version: 'synthetic-live-eval-v1',
    verifiedAt: '2026-07-25T00:00:00.000Z',
    ...streams,
  };
}

function assertCompiledRequest(testCase, privateRequest) {
  if (testCase.expectLocal) {
    if (!privateRequest.localPayload || privateRequest.disclosureBytes !== 0) {
      throw new Error(`case ${testCase.id} unexpectedly called the provider`);
    }
    if (privateRequest.requestType !== testCase.expectedType) {
      throw new Error(
        `case ${testCase.id} routed to ${privateRequest.requestType}`,
      );
    }
    return;
  }
  if (privateRequest.localPayload) {
    throw new Error(`case ${testCase.id} unexpectedly stayed local`);
  }
  if (privateRequest.requestType !== testCase.expectedType) {
    throw new Error(
      `case ${testCase.id} routed to ${privateRequest.requestType}`,
    );
  }
  const outbound = JSON.stringify({
    messages: privateRequest.messages,
    context: privateRequest.context,
  });
  for (const canary of SYNTHETIC_CANARIES) {
    if (outbound.includes(canary)) {
      throw new Error(`case ${testCase.id} leaked synthetic canary`);
    }
  }
  if (outbound.includes(testCase.question)) {
    throw new Error(`case ${testCase.id} forwarded the raw question`);
  }
}

function scoreResponse(testCase, payload) {
  const checks = {
    thaiAnswer: THAI_TEXT.test(payload.answer),
    tablePolicy: Boolean(payload.table) === testCase.expectTable,
    chartPolicy: Boolean(payload.chart) === testCase.expectChart,
    methodPolicy: !testCase.expectMethod || Boolean(payload.methodNote),
    noPlaceholder: !/(?:\.\.\.|…|TBD|placeholder)/iu.test(JSON.stringify(payload)),
    chartShape: !payload.chart || payload.chart.points.every(
      point => point.values.length === payload.chart.series.length,
    ),
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function runRemoteCase({
  apiKey,
  testCase,
  privateRequest,
  reasoningEffort,
  temperature,
  providerOnly,
}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 85_000);
    try {
      return await requestOpenRouter({
        apiKey,
        messages: privateRequest.messages,
        contextJson: privateRequest.contextJson,
        model: REQUIRED_OPENROUTER_MODEL,
        providerOnly,
        signal: controller.signal,
        reasoningEffort,
        temperature,
        seed: 20260725,
      });
    } catch (error) {
      const status = Number(error?.status);
      if (status === 402) {
        error.creditExhausted = true;
        throw error;
      }
      if (![429, 503].includes(status) || attempt === 3) throw error;
      await sleep(Math.min(5_000, 1_000 * (2 ** (attempt - 1))));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const compileOnly = process.argv.includes('--compile-only');
  const apiKey = compileOnly ? null : await loadApiKey();
  const dataset = createSyntheticDataset();
  const reasoningEffort = parseReasoningEffort();
  const temperature = parseTemperature();
  const providerOnly = readArgument('--provider', process.env.OPENROUTER_PROVIDER ?? '');
  if (!compileOnly && !providerOnly) {
    throw new Error(
      'OPENROUTER_PROVIDER or --provider is required and must be a reviewed provider slug',
    );
  }
  const requestedCase = readArgument('--case');
  const cases = requestedCase
    ? CASES.filter(testCase => testCase.id === requestedCase)
    : CASES;
  if (cases.length === 0) throw new Error(`Unknown eval case: ${requestedCase}`);

  const summary = {
    variant: {
      model: REQUIRED_OPENROUTER_MODEL,
      reasoningEffort: reasoningEffort ?? 'none',
      temperature,
      providerOnly: providerOnly || 'compile-only-no-egress',
    },
    passed: 0,
    failed: 0,
    remoteSkipped: 0,
    totalTokens: 0,
    provider: null,
  };

  for (const testCase of cases) {
    const privateRequest = buildPrivateModelRequest({
      dataset,
      messages: [{ role: 'user', content: testCase.question }],
      asOfDate: AS_OF_DATE,
    });
    assertCompiledRequest(testCase, privateRequest);

    if (privateRequest.localPayload) {
      const evaluation = scoreResponse(testCase, privateRequest.localPayload);
      if (evaluation.passed) summary.passed += 1;
      else summary.failed += 1;
      console.log(JSON.stringify({
        case: testCase.id,
        passed: evaluation.passed,
        checks: evaluation.checks,
        disclosureBytes: 0,
        tokens: 0,
        provider: 'local-only',
        answer: privateRequest.localPayload.answer,
        highlights: privateRequest.localPayload.highlights,
      }, null, 2));
      continue;
    }

    if (compileOnly) {
      summary.remoteSkipped += 1;
      console.log(JSON.stringify({
        case: testCase.id,
        passed: true,
        checks: { privacyCompilation: true, remoteCallSkipped: true },
        disclosureBytes: privateRequest.disclosureBytes,
        tokens: 0,
        provider: 'compile-only',
      }, null, 2));
      continue;
    }

    let result;
    try {
      result = await runRemoteCase({
        apiKey,
        testCase,
        privateRequest,
        reasoningEffort,
        temperature,
        providerOnly,
      });
    } catch (error) {
      if (error.creditExhausted) {
        console.log(JSON.stringify({
          event: 'credit-exhausted',
          completed: summary.passed + summary.failed,
          summary,
        }, null, 2));
        return;
      }
      throw error;
    }

    const finalPayload = mergeDeterministicEvidence(
      validateAssistantDisclosure(
        result.payload,
        privateRequest.context,
        dataset,
      ),
      privateRequest.fallbackPayload,
    );
    const evaluation = scoreResponse(testCase, finalPayload);
    summary.totalTokens += result.usage.totalTokens;
    summary.provider = result.provider || summary.provider;
    if (evaluation.passed) summary.passed += 1;
    else summary.failed += 1;

    console.log(JSON.stringify({
      case: testCase.id,
      passed: evaluation.passed,
      checks: evaluation.checks,
      disclosureBytes: privateRequest.disclosureBytes,
      tokens: result.usage.totalTokens,
      provider: result.provider,
      answer: finalPayload.answer,
      highlights: finalPayload.highlights,
    }, null, 2));
  }

  console.log(JSON.stringify({ event: 'summary', ...summary }, null, 2));
  if (summary.failed > 0) process.exitCode = 2;
}

main().catch(error => {
  console.error(JSON.stringify({
    event: 'eval-error',
    name: error?.name ?? 'Error',
    code: error?.publicCode ?? error?.message ?? 'unknown',
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
    stage: error?.stage ?? null,
  }, null, 2));
  process.exitCode = 1;
});
