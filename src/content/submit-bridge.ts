import { installSubmitBridge } from '../submission/bridge';

if (/^\/submit\/\d+\/?$/.test(location.pathname)) installSubmitBridge();
