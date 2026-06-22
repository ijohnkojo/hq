from __future__ import annotations

import base64
import cloudpickle
import typing as tp

# serialize the task object to a base64 encoded string (for client to send to server)
def serialize_obj(obj: tp.Any) -> str:
    pck_obj = cloudpickle.dumps(obj)
    return base64.b64encode(pck_obj).decode("utf-8")

# deserialize the task object from a base64 encoded string (the worker receives this and deserializes it)
def deserialize_obj(obj: str | None) -> tp.Any:
    if obj is None:
        return None

    if not isinstance(obj, str):
        raise TypeError(f"{obj=} needs to be a string at this point")

    return cloudpickle.loads(base64.b64decode(obj.encode("utf-8"), validate=True))


#So the contract is: client cloudpickles + base64-encodes; worker base64-decodes + cloudpickle-loads. Same library on both ends is mandatory, which is why it lives in shared.