// Where uploaded question images go.
//  - FTP (e.g. an o2switch hosting): files are pushed to a public folder of the site
//    and questions point to their public URL. Enabled when IMAGES_FTP_HOST is set.
//  - Otherwise: stored in the SQLite database and served by /api/images/:id.
const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');
const { Client } = require('basic-ftp');

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function databaseImageStore(repo) {
  return {
    kind: 'database',
    async save(ownerId, bytes, type) {
      return `/api/images/${repo.saveImage(ownerId, bytes, type)}`;
    },
  };
}

/**
 * Uploads over FTP with explicit TLS (FTPS). Configuration:
 *   IMAGES_FTP_HOST, IMAGES_FTP_USER, IMAGES_FTP_PASSWORD
 *   IMAGES_FTP_DIR        folder on the server, e.g. /public_html/quizzokopain-images
 *   IMAGES_PUBLIC_URL     public URL of that folder, e.g. https://mon-site.fr/quizzokopain-images
 *   IMAGES_FTP_PORT (21), IMAGES_FTP_INSECURE=1 to disable TLS (not recommended)
 */
function ftpImageStore(config, log = console) {
  const baseUrl = config.publicUrl.replace(/\/+$/, '');
  const dir = config.dir || '/';

  async function withClient(fn) {
    const client = new Client(20000);
    try {
      await client.access({
        host: config.host,
        port: config.port || 21,
        user: config.user,
        password: config.password,
        secure: !config.insecure,
      });
      return await fn(client);
    } finally {
      client.close();
    }
  }

  return {
    kind: 'ftp',
    async save(ownerId, bytes, type) {
      // Unguessable, never reused names: images are public on the website.
      const name = `${Date.now().toString(36)}-${crypto.randomBytes(9).toString('base64url')}.${EXTENSIONS[type] || 'img'}`;
      try {
        await withClient(async (client) => {
          await client.ensureDir(dir);
          await client.uploadFrom(Readable.from(bytes), path.posix.join(dir, name));
        });
      } catch (err) {
        log.error?.('Envoi FTP impossible', err.message);
        throw new Error('Impossible d’envoyer l’image sur le serveur d’images.');
      }
      return `${baseUrl}/${name}`;
    },
  };
}

/** Picks the store from environment variables. */
function createImageStore(repo, env = process.env) {
  if (env.IMAGES_FTP_HOST && env.IMAGES_PUBLIC_URL) {
    return ftpImageStore({
      host: env.IMAGES_FTP_HOST,
      port: Number(env.IMAGES_FTP_PORT) || 21,
      user: env.IMAGES_FTP_USER,
      password: env.IMAGES_FTP_PASSWORD,
      dir: env.IMAGES_FTP_DIR,
      publicUrl: env.IMAGES_PUBLIC_URL,
      insecure: env.IMAGES_FTP_INSECURE === '1',
    });
  }
  return databaseImageStore(repo);
}

module.exports = { createImageStore, databaseImageStore, ftpImageStore };
