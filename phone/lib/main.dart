import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'config.dart';
import 'screens/home_screen.dart';
import 'services/auth_service.dart';
import 'services/socket_service.dart';
import 'state/app_state.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Startup diagnostics — confirms which server URL the build is actually using.
  debugPrint('[config] SERVER_URL=$kServerUrl');

  // Prime the socket handshake with the persisted bearer token (if any) so a
  // returning signed-in user is identified on the socket from the first connect.
  SocketService.setAuthToken(await AuthService.getToken());

  final state = AppState();
  await state.init();

  runApp(HelloviaApp(state: state));
}

class HelloviaApp extends StatelessWidget {
  final AppState state;
  const HelloviaApp({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final palette = state.palette;
        applyPalette(palette);
        final isLight = palette.brightness == Brightness.light;
        SystemChrome.setSystemUIOverlayStyle(
          isLight ? SystemUiOverlayStyle.dark : SystemUiOverlayStyle.light,
        );

        return AppStateProvider(
          state: state,
          child: MaterialApp(
            title: 'Hellovia Translate',
            debugShowCheckedModeBanner: false,
            theme: buildAppTheme(palette),
            home: const HomeScreen(),
          ),
        );
      },
    );
  }
}
