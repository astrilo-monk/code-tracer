# Code Tracer

Code Tracer is an interactive execution tracker for C and Java, built to help you understand what your code is doing. Paste code, hit run, and watch your variables and call stack evolve in real time.

## What it does

- **Visual Memory Tracking**: See stack and heap blocks update live as code executes.
- **Call Stack Tracing**: Follow the exact execution path, particularly useful for recursion and nested function calls.
- **Step-through Debugging**: Play through execution step-by-step or auto-play at adjustable speeds.
- **Beginner Mode**: Translates execution into plain English when you need it.

## Stack

- **Frontend**: React 18 with Tailwind CSS, Monaco Editor, and Zustand
- **Backend**: Python with FastAPI and pygdbmi
- **Tracer**: GCC/GDB for C and JDK tools (javac/jdb) for Java

## Installation

### Prerequisites

Linux or WSL2 is strongly recommended. macOS will work but GDB code-signing can be painful.

Install these first:

```bash
sudo apt update
sudo apt install gcc gdb openjdk-17-jdk python3 python3-pip nodejs
npm install -g yarn
```

You also need Python 3.10+ and Node.js 18+.

### 1. Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

Optional: Create a `.env` file in the backend folder for custom settings.

### 2. Start the Frontend

In a new terminal:

```bash
cd frontend
yarn install
yarn start
```

Open http://localhost:3000 in your browser. Choose C or Java in the editor and run it.

## How the tracer works

1. Your code gets saved to a temporary file and compiled.
2. C code uses gcc -g -O0 and traces through GDB/MI.
3. Java code uses javac and traces through jdb commands.
4. We collect frame info, local variables, and call stack at each step.
5. Everything gets formatted into JSON and sent to the frontend.
6. You can scrub through execution like scrubbing a video.

## Known quirks

- **Everything runs locally**: No required database. Trace history lives in your browser's local storage.
- **Timeouts**: Infinite loops and deep recursion (like fib(100)) hit a hard timeout around 20-25 seconds. The tracer returns whatever steps it managed before the timeout.

## License

MIT License. Fork it, modify it, build on it.
