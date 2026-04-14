import subprocess
import os
import signal
import sys
import time

def kill_on_port(port):
    """Kills any process running on the given port on Windows."""
    try:
        # Get PID of the process on the port
        output = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
        for line in output.strip().split('\n'):
            if 'LISTENING' in line:
                pid = line.strip().split()[-1]
                if pid and pid != '0':
                    print(f"Killing process {pid} on port {port}...")
                    subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
    except Exception:
        pass # No process found on port

def start_server():
    port = 3000
    kill_on_port(port)
    
    print(f"Starting server on http://localhost:{port}...")
    
    env = os.environ.copy()
    env["NODE_ENV"] = "production"
    
    # Using CREATE_NO_WINDOW to hide the console on Windows
    # 0x08000000 is the flag for CREATE_NO_WINDOW
    creation_flags = 0x08000000 if sys.platform == 'win32' else 0
    
    subprocess.Popen(
        ['npx', 'tsx', 'server.ts'],
        env=env,
        creationflags=creation_flags,
        shell=True if sys.platform == 'win32' else False
    )
    
    # Wait a moment to ensure it starts
    time.sleep(2)
    print(f"Server should be running now.")

if __name__ == "__main__":
    start_server()
