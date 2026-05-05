"""OPF-based text anonymizer.

Hard rule: this package is offline-only. CI lint (test_no_egress.py)
fails the build if any module under paperloom/anonymizer/ imports httpx,
requests, urllib, urllib3 or socket.
"""
