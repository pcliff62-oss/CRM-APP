import * as React from 'react';
export interface ContactShape { id: string; name: string; email?: string; phone?: string; }
export interface PropertyShape { id: string; address1: string; }
export interface ManageContactClientProps { contact: ContactShape; property?: PropertyShape | null; inline?: boolean; }
declare const ManageContactClient: React.FC<ManageContactClientProps>;
export default ManageContactClient;
