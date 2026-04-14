import subprocess
import os
import sys
import time
import requests
import webbrowser

def kill_on_port(port):
    """Kills any process running on the given port on Windows."""
    try:
        output = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
        for line in output.strip().split('\n'):
            if 'LISTENING' in line:
                pid = line.strip().split()[-1]
                if pid and pid != '0':
                    print(f"Killing process {pid} on port {port}...")
                    subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
    except Exception:
        pass

def start_desktop():
    port = 3000
    project_root = os.getcwd()

    # 1. Install dependencies
    if not os.path.exists(os.path.join(project_root, 'node_modules')):
        print("Installing dependencies...")
        subprocess.run(['npm', 'install'], shell=True)

    # 2. Build the app
    print("Building application...")
    subprocess.run(['npm', 'run', 'build'], shell=True)

    # 3. Kill existing process
    kill_on_port(port)

    # 4. Start background server (Dev mode)
    print(f"Starting background server on http://localhost:{port}...")
    env = os.environ.copy()
    env["NODE_ENV"] = "development"
    
    creation_flags = 0x08000000 if sys.platform == 'win32' else 0
    
    with open('server.out.log', 'w') as out, open('server.err.log', 'w') as err:
        subprocess.Popen(
            ['npm', 'run', 'dev'],
            env=env,
            creationflags=creation_flags,
            stdout=out,
            stderr=err,
            shell=True if sys.platform == 'win32' else False
        )

    # 5. Wait for server
    print("Waiting for server to initialize...")
    max_retries = 20
    for i in range(max_retries):
        try:
            response = requests.get(f"http://localhost:{port}/api/health")
            if response.status_code == 200:
                print("Server is ready.")
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(1)
    else:
        print("Error: Server failed to start.")
        sys.exit(1)

    # 6. Launch Browser in App Mode
    browser_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    ]
    
    launched = False
    for path in browser_paths:
        if os.path.exists(path):
            print(f"Launching desktop app view via {os.path.basename(path)}...")
            subprocess.Popen([path, f"--app=http://localhost:{port}"])
            launched = True
            break
    
    if not launched:
        print("Browser not found. Opening in default browser...")
        webbrowser.open(f"http://localhost:{port}")

    print("Application is running.")

if __name__ == "__main__":
    start_desktop()
