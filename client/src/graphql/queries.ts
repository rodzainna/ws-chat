import { gql } from "@apollo/client";

export const ROOMS_QUERY = gql`
  query Rooms {
    rooms {
      id
      name
      isPrivate
      isMember
    }
  }
`;

export const ADMIN_DELETE_MESSAGE_MUTATION = gql`
  mutation AdminDeleteMessage($messageId: ID!) {
    deleteMessage(messageId: $messageId) {
      message {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const ROOM_MEMBERS_QUERY = gql`
  query RoomMembers($roomId: ID!) {
    roomMembers(roomId: $roomId) {
      user {
        id
        username
      }
      role
      isOnline
    }
  }
`;

export const ADD_ROOM_MEMBER_MUTATION = gql`
  mutation AddRoomMember($roomId: ID!, $username: String!) {
    addRoomMember(roomId: $roomId, username: $username) {
      room {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const REMOVE_ROOM_MEMBER_MUTATION = gql`
  mutation RemoveRoomMember($roomId: ID!, $userId: ID!) {
    removeRoomMember(roomId: $roomId, userId: $userId) {
      room {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const ROOM_MEMBERSHIP_CANDIDATES_QUERY = gql`
  query RoomMembershipCandidates($roomId: ID!) {
    roomMembershipCandidates(roomId: $roomId) {
      id
      username
    }
  }
`;

export const ROOM_MESSAGES_QUERY = gql`
  query RoomMessages($roomId: ID!, $before: String) {
    messages(roomId: $roomId, before: $before) {
      edges {
        node {
          id
          userId
          username
          content
          createdAt
          editedAt
          deletedAt
          mentionedUsernames
        }
      }
      pageInfo {
        hasPreviousPage
        startCursor
      }
    }
  }
`;
