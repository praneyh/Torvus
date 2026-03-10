module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Resolve the @/ alias (maps to ./src/) at Babel transform time
      // so Metro can find all modules correctly on device.
      ['module-resolver', {
        root: ['.'],
        alias: { '@': './src' },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      }],
    ],
  };
};
