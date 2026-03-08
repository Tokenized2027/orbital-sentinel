#!/usr/bin/env node
/**
 * Verify SentinelRegistry.sol on Sepolia Etherscan via their API.
 * Falls back to Sourcify if no Etherscan API key available.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REGISTRY_ADDRESS = '0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40';
const CHAIN_ID = 11155111; // Sepolia
const COMPILER_VERSION = 'v0.8.24+commit.e11b9ed9';
const CONTRACT_NAME = 'OrbitalSentinelRegistry';

const sourceCode = readFileSync(resolve(ROOT, 'contracts/SentinelRegistry.sol'), 'utf-8');

async function verifyEtherscan() {
  console.log('Attempting Etherscan API verification (no API key — rate limited)...');

  const params = new URLSearchParams({
    apikey: '', // empty — Etherscan allows limited unauthenticated use
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: REGISTRY_ADDRESS,
    sourceCode: sourceCode,
    codeformat: 'solidity-single-file',
    contractname: CONTRACT_NAME,
    compilerversion: COMPILER_VERSION,
    optimizationUsed: '0',
    runs: '200',
    constructorArguements: '', // no constructor args
    evmversion: 'cancun',
    licenseType: '3', // MIT
  });

  const resp = await fetch('https://api-sepolia.etherscan.io/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await resp.json();
  console.log('Etherscan response:', JSON.stringify(data, null, 2));

  if (data.status === '1') {
    const guid = data.result;
    console.log(`Verification submitted! GUID: ${guid}`);
    console.log('Checking status...');

    // Poll for completion
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const checkResp = await fetch(
        `https://api-sepolia.etherscan.io/api?module=contract&action=checkverifystatus&guid=${guid}`
      );
      const checkData = await checkResp.json();
      console.log(`Check ${i + 1}:`, checkData.result);
      if (checkData.result === 'Pass - Verified') {
        console.log('\nContract VERIFIED on Sepolia Etherscan!');
        console.log(`https://sepolia.etherscan.io/address/${REGISTRY_ADDRESS}#code`);
        return true;
      }
      if (checkData.result !== 'Pending in queue') {
        console.log('Verification failed or unexpected status.');
        return false;
      }
    }
    console.log('Timed out waiting for verification.');
    return false;
  } else {
    console.log('Etherscan submission failed:', data.result);
    return false;
  }
}

async function verifySourcify() {
  console.log('\nAttempting Sourcify verification...');

  // Read the compiled metadata
  const artifactPath = resolve(ROOT, 'out/SentinelRegistry.sol/OrbitalSentinelRegistry.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));

  const body = {
    address: REGISTRY_ADDRESS,
    chain: String(CHAIN_ID),
    files: {
      'SentinelRegistry.sol': sourceCode,
      'metadata.json': artifact.rawMetadata,
    },
  };

  const resp = await fetch('https://sourcify.dev/server/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  console.log('Sourcify response:', JSON.stringify(data, null, 2));

  if (data.result && data.result[0]?.status === 'perfect') {
    console.log('\nContract VERIFIED on Sourcify (perfect match)!');
    console.log(`https://sourcify.dev/#/lookup/${REGISTRY_ADDRESS}?chainId=${CHAIN_ID}`);
    return true;
  } else if (data.result && data.result[0]?.status === 'partial') {
    console.log('\nContract partially verified on Sourcify.');
    return true;
  }

  return false;
}

async function main() {
  // Try Etherscan first
  const etherscanOk = await verifyEtherscan();
  if (etherscanOk) return;

  // Fallback to Sourcify
  const sourcifyOk = await verifySourcify();
  if (sourcifyOk) return;

  console.log('\nBoth verification methods failed. You may need an Etherscan API key.');
  console.log('Get one free at: https://etherscan.io/apis');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
