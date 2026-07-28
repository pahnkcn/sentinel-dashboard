import { handleManifest } from '../server/apiHandlers.js';
import { createApiHandler } from '../server/http.js';

export default createApiHandler(handleManifest);
