import type { Dictionary } from "./en"

/**
 * 中文.
 *
 * Typed against the English one, so a key that is added there and forgotten
 * here is a build error rather than an English sentence in the middle of a
 * Chinese screen. `DeepPartial` is deliberately not used: a language is either
 * finished or it is a gap somebody can see.
 */
export const zh: Dictionary = {
  tabs: {
    chats: "聊天",
    contacts: "联系人",
    groups: "群组",
  },
  welcome: {
    tagline: "在 Nimiq 钱包之间收发消息，用付费门槛挡住垃圾信息，而不是靠猜。",
    points: {
      noSignup: {
        title: "无需注册",
        body: "你的 Nimiq 地址就是账号。不用创建，也不用记。",
      },
      spamCosts: {
        title: "垃圾信息需要付费",
        body: "陌生人需要附上少量 NIM 才能找到你。联系人永远免费。",
      },
    },
    openInPay: "在 Nimiq Pay 中打开",
    tryAgain: "重试",
    looking: "正在寻找你的钱包",
    signIn: "用钱包登录",
    oneSignature: "只需一次签名，不会花费任何费用。",
    agree: "登录即表示你同意我们的<terms>服务条款</terms>和<privacy>隐私政策</privacy>。",
  },
  settings: {
    title: "设置",
    language: {
      title: "语言",
      host: "跟随系统",
    },
  },
}
