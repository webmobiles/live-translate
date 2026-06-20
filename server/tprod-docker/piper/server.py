import os
import subprocess
import tempfile
from flask import Flask, jsonify, request

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

    model = model_path(voice)
    if not model:
        return jsonify({'error': f'voice model not found: {voice}'}), 404

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as output:
        output_path = output.name

    try:
        result = subprocess.run(
            [PIPER_BIN, '--model', model, '--output_file', output_path],
            input=text.encode('utf-8'),
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            return jsonify({'error': result.stderr.decode('utf-8', errors='replace')}), 500

        with open(output_path, 'rb') as audio_file:
            return audio_file.read(), 200, {'Content-Type': 'audio/wav'}
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'piper synthesis timed out'}), 504
    except FileNotFoundError:
        return jsonify({'error': 'piper binary not found in PATH'}), 500
    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8881)), debug=False)
