# 第一章 快速开始

这是正文内容。给定一个 Markdown 文件，Folio 会自动生成带目录和页码的 PDF。目录里的页码是排版后测出来的真实页码，可以点进去跳到对应章节。

## 1.1 安装

只需要 Node.js 和 pandoc、typst 两个便携版二进制：

1. 运行 `scripts\setup.ps1` 下载二进制；
2. 运行 `node bin/folio.cjs 书.md -o 书.pdf`。

### 1.1.1 公式支持

公式用 KaTeX 风格书写，Typst 原生渲染：

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$

内联公式如 $O(n \log n)$ 也能正常渲染。

## 1.2 代码块

代码块自动语法高亮：

```cpp
int gcd(int a, int b) {
    return b ? gcd(b, a % b) : a;
}
```

## 1.3 表格

| 算法 | 复杂度 |
|---|---|
| 快速幂 | $O(\log n)$ |
| 埃氏筛 | $O(n \log\log n)$ |

# 第二章 进阶

这一章用来演示章节从新页开始，以及目录页码能正确指向不同页。

## 2.1 数学公式

$$e^{i\pi} + 1 = 0$$

## 2.2 列表

- 第一项
- 第二项
  - 嵌套项

# 第三章 代码模板

```cpp
const int MOD = 998244353;
long long qpow(long long a, long long b) {
    long long r = 1;
    while (b) {
        if (b & 1) r = r * a % MOD;
        a = a * a % MOD;
        b >>= 1;
    }
    return r;
}
```
