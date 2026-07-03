Modal sheet — a solid light panel over a dark backdrop (settings, stats, the win summary). Presentational shell for mocks.

```jsx
<Dialog title="🎉 You won!" onClose={close} footer={<>
  <Button>Close</Button>
  <Button variant="primary">New deal</Button>
</>}>
  <dl>…stats…</dl>
</Dialog>
```

- Dialogs are the one place CardHearth uses a solid light surface instead of felt glass.
- Needs a positioned ancestor (`position: relative/absolute`) — it fills its nearest positioned box, not the screen.
