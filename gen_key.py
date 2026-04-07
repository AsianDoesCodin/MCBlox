import subprocess, time, os

key_path = os.path.join(os.environ['LOCALAPPDATA'], 'McBlox', 'updater-key.pem')
os.makedirs(os.path.dirname(key_path), exist_ok=True)

# Pre-write passwords into stdin before process reads them
p = subprocess.Popen(
    f'npx tauri signer generate -w "{key_path}"',
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    text=True, shell=True,
    cwd=r'c:\Users\Joshua\Desktop\Minecraft Stuff\McBlox\launcher'
)
# Send both passwords immediately
out, _ = p.communicate(input='mcblox\nmcblox\n', timeout=30)
print(out)
