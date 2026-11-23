export const requestType = 'welcome-baek:prefill:v1';
export const responseType = 'welcome-baek:prefill-result:v1';
export type PrefillStatus = 'applied' | 'not-ready' | 'occupied' | 'language-unavailable' | 'failed';
export interface PrefillRequest {
  type: typeof requestType;
  requestId: string;
  problemId: string;
  languageId: string;
  code: string;
  replaceExisting: boolean;
}
export interface PrefillResponse {
  type: typeof responseType;
  requestId: string;
  status: PrefillStatus;
}
