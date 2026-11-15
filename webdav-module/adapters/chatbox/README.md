# Chatbox host adapter boundary

This folder contains the Chatbox project envelope and backup orchestration
contract. Application settings UI, localization and persistence remain in the
host app; this isolated module does not edit the upstream checkout.

The host adapter has two responsibilities:

- Export explicitly selected conversation IDs as a V3 backup with settings,
  copilots and credentials disabled, then pass its archive chunks to the
  Chatbox WebDAV project encoder.
- Decode and integrity-check one explicitly selected project, then call the
  host's backup import API. Keep overwrite confirmation and partial-import
  reporting in this adapter because those semantics belong to the host app.

Keep settings persistence, localization, dialog state and conversation-menu
actions in the host's own integration package. The protocol core must not import
Chatbox aliases, database models, stores or UI modules.

The Android host registers the native plugin, constructs its transport and
injects it into the client:

```ts
const native = registerPlugin<WebDavHttpPlugin>('WebDavHttp')
const client = new WebDavClient(config, createCapacitorWebDavTransport(native))
```

Do not move user credentials into build configuration or project fixtures.
