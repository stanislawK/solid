from pydantic import BaseModel, ConfigDict


class AuthUserInfo(BaseModel):
    id: str | None = None
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    provider: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBase(BaseModel):
    email: str
    name: str
    picture: str | None = None
    provider: str
    is_active: bool = False


class UserCreate(UserBase):
    pass


class UserMeRead(UserBase):
    is_admin: bool = False


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
