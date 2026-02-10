# UpDown Sample Document

This file demonstrates links in UpDown's preview mode.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [External Resources](#external-resources)
- [Code Example](#code-example)
- [Conclusion](#conclusion)

---

## Introduction

Welcome to **UpDown**, a lightweight Markdown viewer and editor. This sample file lets you test how links behave in the preview pane.

Try clicking the links in the [Table of Contents](#table-of-contents) above — they should scroll smoothly to each section.

## Features

UpDown supports both **internal** and **external** links:

1. **Internal links** like [jump to Conclusion](#conclusion) scroll within the preview
2. **External links** open in your default system browser

Here are some formatting examples:

- **Bold text** and _italic text_
- `inline code` for short snippets
- > Blockquotes for emphasis

## External Resources

These links should open in your system browser:

- [Tauri Framework](https://tauri.app/) — the framework powering UpDown
- [markdown-it](https://github.com/markdown-it/markdown-it) — the Markdown parser used for rendering
- [Lucide Icons](https://lucide.dev/) — the icon set used in the toolbar
- [GitHub: UpDown](https://github.com/neshkoli/updown) — this project's repository
- [Wikipedia: Markdown](https://en.wikipedia.org/wiki/Markdown) — learn more about the Markdown format

## Code Example

```javascript
// A simple greeting function
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet('UpDown'));
```

## Hebrew Text (RTL Test)

זהו פסקה בעברית שאמורה להיות מיושרת לימין. הכלי מזהה אוטומטית את השפה הדומיננטית בכל פסקה.

This paragraph is mostly English, so it aligns to the left.

פסקה נוספת בעברית עם קישור פנימי: [חזרה להקדמה](#introduction) וקישור חיצוני: [ויקיפדיה](https://he.wikipedia.org/wiki/Markdown).

## Conclusion

You've reached the end! Try these links to navigate back:

- [Back to top](#updown-sample-document)
- [Back to Table of Contents](#table-of-contents)
- [Visit Tauri docs](https://v2.tauri.app/start/)
