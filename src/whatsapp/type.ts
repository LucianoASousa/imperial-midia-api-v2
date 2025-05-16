export interface Instance {
  name: string;
  token?: string;
  status?: 'connected' | 'disconnected' | 'connecting';
}

export interface ListMessage {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  footerText?: string;
  sections: {
    title: string;
    rows: {
      title: string;
      description?: string;
      rowId: string;
    }[];
  }[];
}

export interface IWebMessageInfo {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: any;
  messageTimestamp: number;
  pushName?: string;
}
