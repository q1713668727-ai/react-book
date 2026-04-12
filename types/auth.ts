/** 登录接口 `result`，与后端 `login` 表字段一致（无 password，头像在 `url`） */
export type AuthUser = {
  account: string;
  name?: string;
  email?: string;
  url?: string;
  sign?: string;
  [key: string]: unknown;
};
