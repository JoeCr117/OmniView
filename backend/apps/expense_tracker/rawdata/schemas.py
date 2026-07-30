from ninja import Schema


class UploadResult(Schema):
    status: str
    filename: str
