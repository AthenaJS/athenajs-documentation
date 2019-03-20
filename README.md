# AthenaJS Documentation

This respository contains the documentation for [athenajs](https:/github.com/AthenaJS/athenajs).

# Contributing

The documentation is generated using [Docma](https://github.com/onury/docma) from the JS comments.

To build the documentation, you first need to clone the [athenajs](https:/github.com/AthenaJS/athenajs) respository and install nodejs the dependencies:

```bash
git clone https://github.com/AthenaJS/athenajs.git
cd athenajs
npm install
cd docma-template-athenajs && npm install
```

Then you have to build the Docma template (AthenaJS uses a slightly modified template derived from the official zebra template) by typing:

```bash
npm run build-docs-template
```

This must be done once.

Then, everytime you need to build the docs, you simply have to type:

```bash
npm run build-docs
```

To start a local server to test the docs generation you may then type:

```bash
npm run serve-docs
```

## License

Copyright (c) Nicolas Ramz.

Licensed under the [MIT](LICENSE) License.
