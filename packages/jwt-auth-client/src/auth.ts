import Cookies, { CookieAttributes } from 'js-cookie';
import { FetchConnector } from './connectors/utils';

export type CookieOptions =
  | CookieAttributes
  | ((accessToken?: string) => CookieAttributes);

export type GetTokens = (
  req: any
) => { refreshToken: string; accessToken: string } | void;

export type Logout = (
  logout: () => Promise<{ done: boolean }>,
  options: any
) => void;

export type Decode = (accessToken: string) => object | null;

export interface AuthClientOptions {
  cookie: string;
  cookieOptions?: CookieOptions;
  decode: Decode;
  fetchConnector: FetchConnector;
  refreshTokenCookie?: string;
  getTokens?: GetTokens;
}

export default class AuthClient {
  public cookie: string;
  public cookieOptions?: CookieOptions;
  public decode: Decode;
  public fetch: FetchConnector;

  private refreshTokenCookie: string;
  private getTokens: GetTokens;
  private clientATFetch?: Promise<string>;

  constructor(options: AuthClientOptions) {
    // Public
    this.cookie = options.cookie || 'a_t';
    this.cookieOptions = options.cookieOptions;
    this.decode = options.decode;
    this.fetch = options.fetchConnector;
    // Private
    this.refreshTokenCookie = options.refreshTokenCookie || 'r_t';
    this.getTokens = options.getTokens || this._getTokens;
  }
  /**
   * Returns the accessToken from cookies
   */
  public getAccessToken() {
    return Cookies.get(this.cookie) || null;
  }
  /**
   * Decodes an accessToken and returns his payload
   */
  public decodeAccessToken(accessToken: string) {
    if (!accessToken) return null;
    return this.decode(accessToken);
  }
  /**
   * Adds an accessToken to a cookie and return the accessToken
   */
  public setAccessToken(accessToken: string) {
    if (!accessToken) return;

    Cookies.set(this.cookie, accessToken, {
      expires: 365,
      secure: location.protocol === 'https:',
      ...this.getCookieOptions(accessToken)
    });

    return accessToken;
  }
  /**
   * Removes the accessToken from cookies
   */
  public removeAccessToken() {
    Cookies.remove(this.cookie, this.getCookieOptions());
  }
  /**
   * Logouts the user, this means remove both accessToken and refreshToken from
   * cookies
   */
  public async logout() {
    if (typeof window === 'undefined') return;

    return this.fetch.logout({ credentials: 'same-origin' }).then(json => {
      this.removeAccessToken();
      return json;
    });
  }
  /**
   * Returns a new accessToken
   * @param req Sending a Request means the token will be created during SSR
   */
  public fetchAccessToken(req?: Request) {
    return req ? this.fetchServerToken(req) : this.fetchClientToken();
  }
  /**
   * Returns the accessToken on SSR from cookies, if no token exists or its
   * invalid then it will fetch a new accessToken
   */
  private async fetchServerToken(req: Request) {
    const tokens = this.getTokens(req);

    if (!tokens) return;

    const accessToken = this.verifyAccessToken(tokens.accessToken);

    if (accessToken) return accessToken;
    if (!tokens.refreshToken) return;

    const data = await this.fetch.createAccessToken({
      headers: req.headers
    });

    return data.accessToken;
  }
  /**
   * Returns the accessToken from cookies, if no token exists or its
   * invalid then it will fetch a new accessToken
   */
  private async fetchClientToken() {
    const _accessToken = this.getAccessToken();
    // If the browser doesn't have an accessToken in cookies then don't try to
    // create a new one
    if (!_accessToken) return;

    const accessToken = this.verifyAccessToken(_accessToken);
    if (accessToken) return accessToken;
    // In this case the accessToken in cookies is invalid and we should create
    // a new one, the promise is reused for the case of when the method is
    // called multiple times
    if (this.clientATFetch) return this.clientATFetch;

    this.clientATFetch = this.fetch
      .createAccessToken({
        credentials: 'same-origin'
      })
      .then(data => {
        this.clientATFetch = undefined;
        this.setAccessToken(data.accessToken);

        return data.accessToken;
      });

    return this.clientATFetch;
  }
  /**
   * Verifies and returns an accessToken if it's still valid
   */
  private verifyAccessToken(accessToken: string) {
    if (accessToken && this.decodeAccessToken(accessToken)) {
      return accessToken;
    }
  }
  /**
   * Returns the cookie options that will be used to set an accessToken
   */
  private getCookieOptions(accessToken?: string) {
    const { cookieOptions } = this;

    return cookieOptions && typeof cookieOptions === 'function'
      ? cookieOptions(accessToken)
      : cookieOptions;
  }
  /**
   * Gets the tokens from a Request
   */
  private _getTokens(req: Request) {
    const parseCookie = require('cookie').parse;
    const cookie = req.headers.get('cookie');
    const cookies = cookie && parseCookie(cookie);

    if (!cookies) return;

    return {
      refreshToken: cookies[this.refreshTokenCookie],
      accessToken: cookies[this.cookie]
    };
  }
}
