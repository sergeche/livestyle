import json

import tornado.httpserver
import tornado.websocket
import tornado.ioloop
import tornado.web

class WSHandler(tornado.websocket.WebSocketHandler):
	clients = set()
	def open(self):
		print('new connection')
		WSHandler.clients.add(self)
		identify_editor(self)
	
	def on_message(self, message):
		print('message received %s' % message)

	def on_close(self):
		print('connection closed')
		WSHandler.clients.remove(self)

def send_message(message, client=None):
	"Sends given message to websocket clients"
	message = json.dumps(message)
	clients = WSHandler.clients if not client else [client]

	for c in clients:
		c.write_message(message)

	if not clients:
		print("Websocket is not available: client list empty")

def identify_editor(socket):
	"Sends editor identification info to browser"
	send_message({
		'action': 'id',
		'data': {
			'id': 'st2',
			'title': 'Sublime Text 2',
			'icon': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABu0lEQVR42q2STWsTURhG3WvdCyq4CEVBAgYCM23JjEwy+cJC41gRdTIEGyELU7BNNMJQhUBBTUjSRdRI3GThRld+gbj2JwhuRFy5cZ3Ncd5LBwZCIIIXDlzmeZ9z4d458t9WoVB4XywWCcnn89i2TSaTIZvNEuRhJvtP0e7R6XT6VYJer8dkMmE0GrHf3uPxg1s8f+TR9ncZDocq63a7SiId6YogBqiPg8FASe43d3iz7/D7rcuP1zf4NnHxfV9yQc0CSFcEeihotVo0Gg22tzbh3SbP7lq4lzTuuHlqtZrkQlSgi8AIBZVKBc/zuH5lnc7tFX4OL/L9wOTJlsbGepFyuSwzUYERCqIXhGVZJJNJbqbP0b66DC8ucO/yedLptMzMF4S3X7JXeFWJ4Zln2LZPw9NT+BuxxQTquaw1Xl47yZ/WEr92j3PgnMBc08nlcvMF1Wo1DNW7G4aBpmnouo5pmtGyzM4K+v0+4/F4ITqdzqzAdV0cxyGVSsmpc5G/s1QqzQg+N5tNdUmJRIJ4PD4XkdTrdaQTClYDlvnHFXTOqu7h5mHAx4AvC/IhYE+6IliK2IwFWT3sHPsL6BnLQ4kfGmsAAAAASUVORK5CYII=',
			'files': [
				'/path/to/button.css'
			]
		}
	}, socket)

application = tornado.web.Application([
	(r'/browser', WSHandler),
])

if __name__ == "__main__":
	application.listen(54000, address='127.0.0.1')
	tornado.ioloop.IOLoop.instance().start()
