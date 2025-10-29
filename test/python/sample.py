# Simple Hello World HTTP server in Python
from http.server import BaseHTTPRequestHandler, HTTPServer

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok')

    def do_POST(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok')

if __name__ == '__main__':
    dummy = ["Bob", "the", "builder", "can", "he", "fix", "it?"]
    raise RuntimeError("Intentional exception for testing DAP exception capture")
    server_address = ('127.0.0.1', 3001)
    httpd = HTTPServer(server_address, SimpleHandler)
    print('Server running at http://127.0.0.1:3001/')
    httpd.serve_forever()
