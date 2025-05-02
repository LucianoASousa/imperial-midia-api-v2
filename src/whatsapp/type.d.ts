export type ListRow = {
  title: string;
  description: string;
  rowId: string;
};

export type ListSection = {
  title: string;
  rows: ListRow[];
};

export type ListMessage = {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  footerText: string;
  sections: ListSection[];
};

export type ListMessageResponse = {
  status: string;
  message: string;
};

export type Instance = {
  id: string;
  name: string;
  connectionStatus: string;
  ownerJid: string;
  profileName: sting;
  profilePicUrl: string;
  integration: string;
  number?: string;
  businessId?: string;
  token: string;
  clientName: string;
  disconnectionReasonCode: number;
  disconnectionObject: string;
  disconnectionAt: Date;
  createdAt: Date;
  updatedAt: Date;
  _count: { Message: 64635; Contact: 1387; Chat: 797 };
};
