# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: self-serve-group-sizes.spec.ts >> self-serve match building -- exact and overflow invite pools >> 2-player match, invite exactly enough (1)
- Location: specs\self-serve-group-sizes.spec.ts:65:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - link "🎾 Club Tennis" [ref=e4] [cursor=pointer]:
        - /url: /
      - generic [ref=e5]:
        - text: Zoom
        - combobox "Zoom" [ref=e6]:
          - option "50%"
          - option "60%"
          - option "70%"
          - option "80%"
          - option "90%"
          - option "100%" [selected]
          - option "110%"
          - option "125%"
          - option "150%"
    - navigation [ref=e8]:
      - link "Log in" [ref=e9] [cursor=pointer]:
        - /url: /login
  - main [ref=e10]:
    - generic [ref=e12]:
      - heading "Build Your Own Match" [level=1] [ref=e13]
      - paragraph [ref=e14]: This isn't turned on for your account yet — ask a manager to opt you in to self-serve matches on the Roster page.
  - alert [ref=e15]
```