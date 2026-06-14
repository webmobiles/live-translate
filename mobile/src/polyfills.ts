if (typeof global.FormData === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  global.FormData = require('react-native/Libraries/Network/FormData');
}
