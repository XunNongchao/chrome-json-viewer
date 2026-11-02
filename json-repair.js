// 宽松 JSON 解析：自动处理转义、外层包裹、JSONC/JSON5 风格语法等常见“非标准 JSON”输入。
(() => {
  "use strict";

  const MAX_DEPTH = 5;
  const WHITESPACE = new Set([" ", "\t", "\n", "\r", " ", "​", " ", " ", "　", "﻿"]);
  const LITERALS = {
    true: { value: true },
    false: { value: false },
    null: { value: null },
    True: { value: true, feature: "python" },
    False: { value: false, feature: "python" },
    None: { value: null, feature: "python" },
    undefined: { value: null, feature: "literal" }
  };
  const FEATURE_LABELS = {
    unescape: "反转义",
    unwrap: "去除包裹",
    stringified: "解析字符串内 JSON",
    comment: "注释",
    trailingComma: "尾随逗号",
    singleQuote: "单引号",
    unquotedKey: "无引号键",
    python: "Python 字面量",
    literal: "非标准字面量",
    number: "非标准数字",
    whitespace: "特殊空白字符"
  };
  const STRICT_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
  const LOOSE_NUMBER = /[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
  const IDENTIFIER = /[A-Za-z0-9_$\u0080-￿-]+/y;

  /**
   * 解析输入文本。成功返回 { value, fixes }，fixes 为空数组表示是标准 JSON；
   * 失败返回 { error }，error 为标准 JSON.parse 的原始报错。
   */
  function parse(raw) {
    try {
      const value = JSON.parse(raw);
      return finalize(value, new Set());
    } catch (error) {
      const repaired = repair(raw, 0);
      return repaired ? finalize(repaired.value, repaired.features) : { error };
    }
  }

  function finalize(value, features) {
    // 整体被 JSON.stringify 过一次（甚至多次）的情况："{\"a\":1}"
    let current = value;

    for (let depth = 0; depth < MAX_DEPTH && looksLikeJsonText(current); depth += 1) {
      const nested = repair(current, 0, true);

      if (!nested) {
        break;
      }

      features.add("stringified");
      nested.features.forEach((feature) => features.add(feature));
      current = nested.value;
    }

    return {
      value: current,
      fixes: [...features].map((feature) => FEATURE_LABELS[feature] || feature)
    };
  }

  function repair(text, depth, allowStrict = false) {
    const trimmed = text.trim();

    if (!trimmed) {
      return null;
    }

    const candidates = [{ text: trimmed, features: [] }];
    const unwrapped = unwrap(trimmed);

    if (unwrapped !== trimmed) {
      candidates.push({ text: unwrapped, features: ["unwrap"] });
    }

    for (const candidate of candidates) {
      if (allowStrict || candidate.text !== trimmed) {
        try {
          return withFeatures(JSON.parse(candidate.text), candidate.features);
        } catch {
          // 继续尝试宽松解析
        }
      }

      try {
        const result = relaxedParse(candidate.text);
        return withFeatures(result.value, [...candidate.features, ...result.features]);
      } catch {
        // 继续尝试下一个候选
      }
    }

    if (depth >= MAX_DEPTH || !/\\["\\/bfnrtu']/.test(trimmed)) {
      return null;
    }

    const unescaped = unescape(unwrapped);

    if (unescaped === unwrapped) {
      return null;
    }

    const nested = repair(unescaped, depth + 1, true);

    if (!nested) {
      return null;
    }

    nested.features.add("unescape");

    if (unwrapped !== trimmed) {
      nested.features.add("unwrap");
    }

    return nested;
  }

  function withFeatures(value, features) {
    return { value, features: new Set(features) };
  }

  // 去掉 Markdown 代码块、外层引号、变量赋值、JSONP 回调等包裹，只保留最外层的 {...} 或 [...]
  function unwrap(text) {
    let result = text;
    const fence = result.match(/^```[\w-]*\s*\n([\s\S]*?)\n?```$/);

    if (fence) {
      result = fence[1].trim();
    }

    const objectStart = result.indexOf("{");
    const arrayStart = result.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index !== -1);

    if (!starts.length) {
      return result;
    }

    const start = Math.min(...starts);
    const end = result.lastIndexOf(result[start] === "{" ? "}" : "]");

    if (end <= start) {
      return result;
    }

    return result.slice(start, end + 1);
  }

  // 去掉一层字符串转义：\" -> "，\\ -> \，\n -> 换行，\uXXXX -> 对应字符
  function unescape(text) {
    let result = "";

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (char !== "\\" || index === text.length - 1) {
        result += char;
        continue;
      }

      const next = text[index + 1];
      const decoded = decodeEscape(text, index + 1);

      if (decoded) {
        result += decoded.text;
        index += decoded.length;
      } else {
        result += char + next;
        index += 1;
      }
    }

    return result;
  }

  function decodeEscape(text, index) {
    const char = text[index];
    const simple = { '"': '"', "'": "'", "\\": "\\", "/": "/", "`": "`", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

    if (char in simple) {
      return { text: simple[char], length: 1 };
    }

    if (char === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) {
      return { text: String.fromCharCode(parseInt(text.slice(index + 1, index + 5), 16)), length: 5 };
    }

    if (char === "x" && /^[0-9a-fA-F]{2}$/.test(text.slice(index + 1, index + 3))) {
      return { text: String.fromCharCode(parseInt(text.slice(index + 1, index + 3), 16)), length: 3 };
    }

    return null;
  }

  function looksLikeJsonText(value) {
    return typeof value === "string" && /^\s*[[{]/.test(value) && /[\]}]\s*$/.test(value);
  }

  // 支持注释、尾随逗号、单引号/反引号字符串、无引号键、Python 字面量、十六进制等宽松语法
  function relaxedParse(text) {
    const features = new Set();
    let index = 0;

    const value = parseValue();
    skipIgnored();

    if (index < text.length) {
      fail("Unexpected trailing content");
    }

    return { value, features };

    function fail(message) {
      throw new SyntaxError(`${message} at position ${index}`);
    }

    function skipIgnored() {
      while (index < text.length) {
        const char = text[index];

        if (WHITESPACE.has(char)) {
          if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r") {
            features.add("whitespace");
          }
          index += 1;
          continue;
        }

        if (char === "/" && text[index + 1] === "/") {
          features.add("comment");
          skipLine();
          continue;
        }

        if (char === "#") {
          features.add("comment");
          skipLine();
          continue;
        }

        if (char === "/" && text[index + 1] === "*") {
          const end = text.indexOf("*/", index + 2);

          if (end === -1) {
            fail("Unterminated comment");
          }

          features.add("comment");
          index = end + 2;
          continue;
        }

        return;
      }
    }

    function skipLine() {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end + 1;
    }

    function parseValue() {
      skipIgnored();
      const char = text[index];

      if (char === "{") {
        return parseObject();
      }

      if (char === "[") {
        return parseArray();
      }

      if (char === '"' || char === "'" || char === "`") {
        return parseString();
      }

      if (char === "-" || char === "+" || char === "." || (char >= "0" && char <= "9")) {
        return parseNumber();
      }

      const word = readIdentifier();

      if (word && Object.prototype.hasOwnProperty.call(LITERALS, word)) {
        const literal = LITERALS[word];

        if (literal.feature) {
          features.add(literal.feature);
        }

        return literal.value;
      }

      return fail("Unexpected token");
    }

    function parseObject() {
      const result = {};
      index += 1;
      skipIgnored();

      while (text[index] !== "}") {
        const key = parseKey();
        skipIgnored();

        if (text[index] !== ":") {
          fail("Expected ':'");
        }

        index += 1;
        Object.defineProperty(result, key, {
          value: parseValue(),
          enumerable: true,
          writable: true,
          configurable: true
        });

        if (!consumeSeparator("}")) {
          break;
        }
      }

      if (text[index] !== "}") {
        fail("Expected '}'");
      }

      index += 1;
      return result;
    }

    function parseKey() {
      const char = text[index];

      if (char === '"' || char === "'" || char === "`") {
        return parseString();
      }

      const word = readIdentifier();

      if (!word) {
        fail("Expected property name");
      }

      features.add("unquotedKey");
      return word;
    }

    function parseArray() {
      const result = [];
      index += 1;
      skipIgnored();

      while (text[index] !== "]") {
        result.push(parseValue());

        if (!consumeSeparator("]")) {
          break;
        }
      }

      if (text[index] !== "]") {
        fail("Expected ']'");
      }

      index += 1;
      return result;
    }

    // 读取元素之间的逗号；返回 false 表示容器已结束
    function consumeSeparator(close) {
      skipIgnored();

      if (text[index] !== ",") {
        return false;
      }

      index += 1;
      skipIgnored();

      if (text[index] === close) {
        features.add("trailingComma");
        return false;
      }

      return true;
    }

    function parseString() {
      const quote = text[index];
      let result = "";
      index += 1;

      if (quote !== '"') {
        features.add("singleQuote");
      }

      while (index < text.length) {
        const char = text[index];

        if (char === quote) {
          index += 1;
          return result;
        }

        if (char === "\\") {
          const decoded = decodeEscape(text, index + 1);

          if (decoded) {
            result += decoded.text;
            index += decoded.length + 1;
          } else if (text[index + 1] === "\n") {
            index += 2;
          } else {
            result += text[index + 1] ?? "";
            index += 2;
          }
          continue;
        }

        result += char;
        index += 1;
      }

      return fail("Unterminated string");
    }

    function parseNumber() {
      LOOSE_NUMBER.lastIndex = index;
      const match = LOOSE_NUMBER.exec(text);

      if (!match) {
        return fail("Invalid number");
      }

      const raw = match[0];
      const negative = raw.startsWith("-");
      const unsigned = raw.replace(/^[+-]/, "");
      const number = Number(unsigned);

      if (Number.isNaN(number)) {
        fail("Invalid number");
      }

      if (!STRICT_NUMBER.test(raw)) {
        features.add("number");
      }

      index += raw.length;
      return negative ? -number : number;
    }

    function readIdentifier() {
      IDENTIFIER.lastIndex = index;
      const match = IDENTIFIER.exec(text);

      if (!match) {
        return "";
      }

      index += match[0].length;
      return match[0];
    }
  }

  globalThis.JsonRepair = { parse };
})();
