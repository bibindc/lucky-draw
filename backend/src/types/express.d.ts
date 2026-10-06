declare global {
  namespace Express {
    interface Request {
      adminId?: string;
      agentId?: string;
      role?: 'SUPER_ADMIN' | 'AGENT';
    }
  }
}

export {};