import os
import subprocess
import tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)
MODELS_DIR = os.environ.get('MODELS_DIR', '/models')
PIPER_BIN = os.environ.get('PIPER_BIN', 'piper')


def model_path(voice: str):
    path = os.path.join(MODELS_DIR, f'{voice}.onnx')
    return path if os.path.exists(path) else None


@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})


@app.route('/v1/audio/speech', methods=['POST'])
def speech():
    data = request.json or {}
    text = (data.get('input') or '').strip()
    voice = data.get('voice') or os.environ.get('PIPER_DEFAULT_VOICE', 'de_DE-thorsten-medium')

    if not text:
        return jsonify({'error': 'input is empty'}), 400

    mp = model_path(voice)
    if not mp:
        return jsonify({
            'error': f'voice model not found: {voice}',
            'hint': 'Run ./tdocker/install-piper-voices.sh to download voice models',
        }), 404

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        out_path = f.name

    try:
        result = subprocess.run(
            [PIPER_BIN, '--model', mp, '--output_file', out_path],
            input=text.encode('utf-8'),
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            err = result.stderr.decode('utf-8', errors='replace')
            return jsonify({'error': err}), 500

        with open(out_path, 'rb') as f:
            audio = f.read()

        return audio, 200, {'Content-Type': 'audio/wav'}

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'piper synthesis timed out'}), 504
    except FileNotFoundError:
        return jsonify({'error': 'piper binary not found in PATH'}), 500
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8881))
    app.run(host='0.0.0.0', port=port, debug=False)
