/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/create`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/join`; params?: Router.UnknownInputParams; } | { pathname: `/settings`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `/room/[code]`, params: Router.UnknownInputParams & { code: string | number; } };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/create`; params?: Router.UnknownOutputParams; } | { pathname: `/`; params?: Router.UnknownOutputParams; } | { pathname: `/join`; params?: Router.UnknownOutputParams; } | { pathname: `/settings`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `/room/[code]`, params: Router.UnknownOutputParams & { code: string; } };
      href: Router.RelativePathString | Router.ExternalPathString | `/create${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `/join${`?${string}` | `#${string}` | ''}` | `/settings${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/create`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/join`; params?: Router.UnknownInputParams; } | { pathname: `/settings`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | `/room/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}` | { pathname: `/room/[code]`, params: Router.UnknownInputParams & { code: string | number; } };
    }
  }
}
