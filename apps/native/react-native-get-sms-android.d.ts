// react-native-get-sms-android has no bundled types (last published 2022,
// predates most of the ecosystem's TS-first conventions). Minimal surface
// declared here — only what lib/sms.ts actually calls.
declare module 'react-native-get-sms-android' {
  export interface SmsFilter {
    box: 'inbox' | 'sent' | 'draft' | 'outbox' | 'failed' | 'queued';
    minDate?: number;
    maxDate?: number;
    indexFrom?: number;
    maxCount?: number;
  }

  export interface SmsMessage {
    _id: string;
    address: string;
    body: string;
    date: number;
    date_sent: number;
    read: number;
    status: number;
    type: number;
  }

  const SmsAndroid: {
    list(
      filter: string,
      failCallback: (error: string) => void,
      successCallback: (count: number, smsList: string) => void,
    ): void;
  };

  export default SmsAndroid;
}
