#!/usr/bin/env node
/**
 * Generate the VAPID key pair that identifies this server to push services.
 *
 * Web Push requires the sender to sign every request with a key pair the
 * browser was told about at subscribe time. The public half is baked into the
 * client bundle; the private half is a server secret and must never be.
 *
 *   node scripts/generate-vapid.mjs
 *
 * Run this ONCE per deployment and keep the output. Regenerating invalidates
 * every existing subscription — browsers reject a push signed by a key that
 * doesn't match the one they subscribed with, so every device would go silent
 * until it re-subscribed.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to your deployment's environment (and .env.local for dev):

  # Public — inlined into the browser bundle. Safe to expose.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}

  # Secret — server only. Never prefix a secret with NEXT_PUBLIC_.
  VAPID_PRIVATE_KEY=${privateKey}

  # A contact the push service can reach if your sends misbehave.
  # Must be a mailto: or https: URL.
  VAPID_SUBJECT=mailto:you@example.com

Keep the private key. Regenerating it silences every device that already
subscribed until it subscribes again.
`);
