// Flags: --expose-internals --no-warnings
'use strict';

const common = require('../common');

if (!common.hasCrypto)
  common.skip('missing crypto');

const assert = require('assert');
const { subtle } = globalThis.crypto;
const { KeyObject } = require('crypto');

// This is only a partial test. The WebCrypto Web Platform Tests
// will provide much greater coverage.

// Test ECDH key derivation
{
  async function test(namedCurve) {
    const [alice, bob] = await Promise.all([
      subtle.generateKey({ name: 'ECDH', namedCurve }, true, ['deriveKey']),
      subtle.generateKey({ name: 'ECDH', namedCurve }, true, ['deriveKey']),
    ]);

    const [secret1, secret2] = await Promise.all([
      subtle.deriveKey({
        name: 'ECDH', namedCurve, public: alice.publicKey
      }, bob.privateKey, {
        name: 'AES-CBC',
        length: 256
      }, true, ['encrypt']),
      subtle.deriveKey({
        name: 'ECDH', namedCurve, public: bob.publicKey
      }, alice.privateKey, {
        name: 'AES-CBC',
        length: 256
      }, true, ['encrypt']),
    ]);

    const [raw1, raw2] = await Promise.all([
      subtle.exportKey('raw', secret1),
      subtle.exportKey('raw', secret2),
    ]);

    assert.deepStrictEqual(raw1, raw2);
  }

  test('P-521').then(common.mustCall());
}

// Test HKDF key derivation
{
  async function test(pass, info, salt, hash, expected) {
    const ec = new TextEncoder();
    const key = await subtle.importKey(
      'raw',
      ec.encode(pass),
      { name: 'HKDF', hash },
      false, ['deriveKey']);

    const secret = await subtle.deriveKey({
      name: 'HKDF',
      hash,
      salt: ec.encode(salt),
      info: ec.encode(info)
    }, key, {
      name: 'AES-CTR',
      length: 256
    }, true, ['encrypt']);

    const raw = await subtle.exportKey('raw', secret);

    assert.strictEqual(Buffer.from(raw).toString('hex'), expected);
  }

  const kTests = [
    ['hello', 'there', 'my friend', 'SHA-256',
     '14d93b0ccd99d4f2cbd9fbfe9c830b5b8a43e3e45e32941ef21bdeb0fa87b6b6'],
    ['hello', 'there', 'my friend', 'SHA-384',
     'e36cf2cf943d8f3a88adb80f478745c336ac811b1a86d03a7d10eb0b6b52295c'],
  ];

  const tests = Promise.all(kTests.map((args) => test(...args)));

  tests.then(common.mustCall());
}

// Test PBKDF2 key derivation
{
  async function test(pass, salt, iterations, hash, expected) {
    const ec = new TextEncoder();
    const key = await subtle.importKey(
      'raw',
      ec.encode(pass),
      { name: 'PBKDF2', hash },
      false, ['deriveKey']);
    const secret = await subtle.deriveKey({
      name: 'PBKDF2',
      hash,
      salt: ec.encode(salt),
      iterations,
    }, key, {
      name: 'AES-CTR',
      length: 256
    }, true, ['encrypt']);

    const raw = await subtle.exportKey('raw', secret);

    assert.strictEqual(Buffer.from(raw).toString('hex'), expected);
  }

  const kTests = [
    ['hello', 'there', 10, 'SHA-256',
     'f72d1cf4853fffbd16a42751765d11f8dc7939498ee7b7ce7678b4cb16fad880'],
    ['hello', 'there', 5, 'SHA-384',
     '201509b012c9cd2fbe7ea938f0c509b36ecb140f38bf9130e96923f55f46756d'],
  ];

  const tests = Promise.all(kTests.map((args) => test(...args)));

  tests.then(common.mustCall());
}

// Test default key lengths
{
  const vectors = [
    ['PBKDF2', 'deriveKey', 528],
    ['HKDF', 'deriveKey', 528],
    [{ name: 'HMAC', hash: 'SHA-1' }, 'sign', 512],
    [{ name: 'HMAC', hash: 'SHA-256' }, 'sign', 512],
    // Not long enough secret generated by ECDH
    // [{ name: 'HMAC', hash: 'SHA-384' }, 'sign', 1024],
    // [{ name: 'HMAC', hash: 'SHA-512' }, 'sign', 1024],
  ];

  (async () => {
    const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-521' }, false, ['deriveKey']);
    for (const [derivedKeyAlgorithm, usage, expected] of vectors) {
      const derived = await subtle.deriveKey(
        { name: 'ECDH', public: keyPair.publicKey },
        keyPair.privateKey,
        derivedKeyAlgorithm,
        false,
        [usage]);

      if (derived.algorithm.name === 'HMAC') {
        assert.strictEqual(derived.algorithm.length, expected);
      } else {
        // KDFs cannot be exportable and do not indicate their length
        const secretKey = KeyObject.from(derived);
        assert.strictEqual(secretKey.symmetricKeySize, expected / 8);
      }
    }
  })().then(common.mustCall());
}

{
  const vectors = [
    [{ name: 'HMAC', hash: 'SHA-1' }, 'sign', 512],
    [{ name: 'HMAC', hash: 'SHA-256' }, 'sign', 512],
    [{ name: 'HMAC', hash: 'SHA-384' }, 'sign', 1024],
    [{ name: 'HMAC', hash: 'SHA-512' }, 'sign', 1024],
  ];

  (async () => {
    for (const [derivedKeyAlgorithm, usage, expected] of vectors) {
      const derived = await subtle.deriveKey(
        { name: 'PBKDF2', salt: new Uint8Array([]), hash: 'SHA-256', iterations: 20 },
        await subtle.importKey('raw', new Uint8Array([]), { name: 'PBKDF2' }, false, ['deriveKey']),
        derivedKeyAlgorithm,
        false,
        [usage]);

      assert.strictEqual(derived.algorithm.length, expected);
    }
  })().then(common.mustCall());
}

// Test X25519 and X448 key derivation
{
  async function test(name) {
    const [alice, bob] = await Promise.all([
      subtle.generateKey({ name }, true, ['deriveKey']),
      subtle.generateKey({ name }, true, ['deriveKey']),
    ]);

    const [secret1, secret2] = await Promise.all([
      subtle.deriveKey({
        name, public: alice.publicKey
      }, bob.privateKey, {
        name: 'AES-CBC',
        length: 256
      }, true, ['encrypt']),
      subtle.deriveKey({
        name, public: bob.publicKey
      }, alice.privateKey, {
        name: 'AES-CBC',
        length: 256
      }, true, ['encrypt']),
    ]);

    const [raw1, raw2] = await Promise.all([
      subtle.exportKey('raw', secret1),
      subtle.exportKey('raw', secret2),
    ]);

    assert.deepStrictEqual(raw1, raw2);
  }

  if (!process.features.openssl_is_boringssl) {
    test('X25519').then(common.mustCall());
    test('X448').then(common.mustCall());
  }
}
