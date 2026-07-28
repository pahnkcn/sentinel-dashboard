import { handleSentinelChat } from '../server/chat/handler.js';
import { createApiHandler } from '../server/http.js';

export default createApiHandler(handleSentinelChat);
