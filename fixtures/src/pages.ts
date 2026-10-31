export const FORM_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Aether Form Fixture</title>
</head>
<body>
  <header>
    <h1>User Registration</h1>
  </header>
  <main>
    <form id="reg-form" action="#">
      <div>
        <label for="username">Full Name:</label>
        <input type="text" id="username" name="username" placeholder="Enter full name" required>
      </div>
      <div>
        <label for="email">Email Address:</label>
        <input type="email" id="email" name="email" placeholder="name@example.com" required>
      </div>
      <div>
        <label for="country">Country:</label>
        <select id="country" name="country">
          <option value="US">United States</option>
          <option value="UK">United Kingdom</option>
          <option value="IN">India</option>
        </select>
      </div>
      <div>
        <label>
          <input type="checkbox" id="newsletter" name="newsletter">
          Subscribe to monthly newsletter
        </label>
      </div>
      <div>
        <button type="submit" id="submit-btn">Submit Application</button>
      </div>
    </form>
  </main>
</body>
</html>
`;

export const NESTED_GRANDCHILD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nested Grandchild</title>
</head>
<body>
  <h3>Grandchild Frame</h3>
  <button id="deep-btn">Deep Nested Action</button>
</body>
</html>
`;

export const NESTED_CHILD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nested Child</title>
</head>
<body>
  <h2>Child Frame</h2>
  <a href="#child-link">Child Anchor Link</a>
  <iframe id="grandchild-frame" src="/nested-grandchild.html" width="300" height="150"></iframe>
</body>
</html>
`;

export const NESTED_IFRAMES_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nested Iframes Fixture</title>
</head>
<body>
  <h1>Parent Top Frame</h1>
  <button id="top-btn">Top Level Button</button>
  <iframe id="child-frame" src="/nested-child.html" width="500" height="300"></iframe>
</body>
</html>
`;

export const CROSS_ORIGIN_CHILD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Cross Origin Child Frame</title>
</head>
<body>
  <h2>Cross Origin Child Container</h2>
  <button id="apply-btn">Apply Now</button>
</body>
</html>
`;

export const CROSS_ORIGIN_PAGE_HTML = (childUrl: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Cross Origin Host Fixture</title>
</head>
<body>
  <h1>Cross Origin Main Frame</h1>
  <button id="main-btn">Main Button</button>
  <iframe id="cross-frame" src="${childUrl}" width="600" height="300"></iframe>
</body>
</html>
`;

export const SHADOW_DOM_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shadow DOM Fixture</title>
</head>
<body>
  <h1>Shadow DOM Test Host</h1>
  <div id="host-element"></div>
  <script>
    const host = document.getElementById('host-element');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = \`
      <div class="shadow-container">
        <h2>Inside Shadow Root</h2>
        <button id="shadow-btn">Shadow Button Action</button>
      </div>
    \`;
  </script>
</body>
</html>
`;

export const LONG_LIST_PAGE_HTML = (() => {
  let items = '';
  for (let i = 1; i <= 500; i++) {
    items += `    <li><a href="#item-${i}">Row item number ${i} in catalog</a></li>\n`;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>500 Row List Fixture</title>
</head>
<body>
  <h1>Large Catalog Feed</h1>
  <ul id="catalog-list">
${items}
  </ul>
</body>
</html>
`;
})();
